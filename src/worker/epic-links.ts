import { Parser } from "commonmark"
import type { RepoRef } from "./forgejo/client.ts"

export type EpicReference = RepoRef & { readonly number: number; readonly ref: string }

const MAX_CHILDREN = 200
const NAME = "[A-Za-z0-9_.-]+"
const SHORT_REF = new RegExp(`^(?:(?:(${NAME})/)?(${NAME}))?#([1-9][0-9]*)(?![A-Za-z0-9])`)
const ISSUE_PATH = new RegExp(`^/(${NAME})/(${NAME})/(?:issues|pulls)/([1-9][0-9]*)/?$`)
// Forgejo's Goldmark task list extension reads the checkbox from the source of the item's first
// line, so escapes, emphasis, and link definitions there make it plain text.
const CHECKBOX = /^\[[ xX]\][\t ]+/
const firstWord = (text: string) => /^\S*/.exec(text.trimStart())?.[0] ?? ""

/** The text and destination of the inline link `text` starts with, as CommonMark reads it. */
const leadingLink = (text: string) => {
  const block = new Parser().parse(text).firstChild
  const link = block?.type === "paragraph" ? block.firstChild : null
  if (link?.type !== "link") return undefined
  // A code span keeps its place as a backtick, so a word in it is never the reference.
  let label = ""
  const walker = link.walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    if (!step.entering) continue
    if (step.node.type === "text") label += step.node.literal ?? ""
    if (step.node.type === "code") label += "`"
  }
  return { label, destination: link.destination ?? "" }
}

/** The issue that `token`, a word or link destination after a checkbox, names, if valid. */
const referenceOf = (
  token: string,
  repository: RepoRef,
  base: URL,
  prefix: string,
): EpicReference | undefined => {
  const target = token.replace(/^[(<[*_]+/, "")
  let owner = repository.owner
  let name = repository.name
  let number: number
  const short = SHORT_REF.exec(target)
  if (short !== null) {
    owner = short[1] ?? owner
    name = short[2] ?? name
    number = Number(short[3])
  } else {
    const link = /^[^<>()[\]]+/.exec(target)?.[0].replace(/[.,:;!?*_]+$/, "") ?? ""
    if (!URL.canParse(link)) return undefined
    const url = new URL(link)
    if (url.origin !== base.origin || !url.pathname.startsWith(`${prefix}/`)) return undefined
    const issue = ISSUE_PATH.exec(url.pathname.slice(prefix.length))
    if (issue === null) return undefined
    owner = issue[1] ?? owner
    name = issue[2] ?? name
    number = Number(issue[3])
  }
  if (!Number.isSafeInteger(number) || [owner, name].some((part) => part === "." || part === ".."))
    return undefined
  owner = owner.toLowerCase()
  name = name.toLowerCase()
  return { owner, name, number, ref: `${owner}/${name}#${number}` }
}

/**
 * The issues that the list items of an epic's body reference, in body order. The body is parsed
 * as CommonMark, as Forgejo renders it, so code and HTML never hold list items. The reference
 * comes from the source text of each item's first line, after an optional task checkbox. A
 * leading inline link names its issue by its text or, failing that, its destination.
 */
export const parseEpicChildren = (
  body: string,
  repository: RepoRef,
  forgejoUrl: string,
): ReadonlyArray<EpicReference> => {
  const base = new URL(forgejoUrl)
  const prefix = base.pathname.replace(/\/$/, "")
  const children = new Map<string, EpicReference>()
  const lines = body.split(/\r\n|\r|\n/)
  const named = (token: string) => referenceOf(token, repository, base, prefix)
  const walker = new Parser().parse(body).walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    const paragraph = step.node.firstChild
    if (!step.entering || step.node.type !== "item" || paragraph?.type !== "paragraph") continue
    const [[line, column]] = paragraph.sourcepos
    const text = (lines[line - 1]?.slice(column - 1) ?? "").replace(CHECKBOX, "")
    const link = leadingLink(text)
    const reference =
      link === undefined
        ? named(firstWord(text))
        : (named(firstWord(link.label)) ??
          (/^https?:\/\//i.test(link.destination) ? named(link.destination) : undefined))
    if (reference === undefined) continue
    children.set(reference.ref, reference)
    if (children.size === MAX_CHILDREN) break
  }
  return [...children.values()]
}
