import { type Node, Parser } from "commonmark"
import type { RepoRef } from "./forgejo/client.ts"

export type EpicReference = RepoRef & { readonly number: number; readonly ref: string }

export const MAX_CHILDREN = 200
const NAME = "[A-Za-z0-9_.-]+"
const SHORT_REF = new RegExp(`^(?:(?:(${NAME})/)?(${NAME}))?#([1-9][0-9]*)(?![A-Za-z0-9])`)
const ISSUE_PATH = new RegExp(`^/(${NAME})/(${NAME})/(?:issues|pulls)/([1-9][0-9]*)/?$`)
// Forgejo's Goldmark task list extension reads the checkbox from the source of the item's first
// line, so escapes, emphasis, and link definitions there make it plain text.
const CHECKBOX = /^\[[ xX]\][\t ]+/
const LINE = /\r\n|\r|\n/
const firstWord = (text: string) => /^\S*/.exec(text.trimStart())?.[0] ?? ""

type Token =
  | { readonly _tag: "Word"; readonly text: string }
  | { readonly _tag: "Link"; readonly label: string; readonly destination: string }
  | { readonly _tag: "Opaque" }
  | { readonly _tag: "Break" }

const linkToken = (link: Node): Token => {
  // A code span keeps its place as a backtick, so a word in it is never the reference.
  let label = ""
  const walker = link.walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    if (!step.entering) continue
    if (step.node.type === "text") label += step.node.literal ?? ""
    if (step.node.type === "code") label += "`"
  }
  return { _tag: "Link", label, destination: link.destination ?? "" }
}

/** The inline link `text` starts with, as CommonMark reads it, or else its first word. */
const leadingToken = (text: string): Token => {
  const block = new Parser().parse(text).firstChild
  const link = block?.type === "paragraph" ? block.firstChild : null
  return link?.type === "link" ? linkToken(link) : { _tag: "Word", text: firstWord(text) }
}

/**
 * The tokens of a paragraph's or heading's inline content, as CommonMark parsed it. Text joins
 * across emphasis, so `**Parent**:` is the one word `Parent:`.
 */
const inlineTokens = (block: Node): ReadonlyArray<Token> => {
  const tokens: Array<Token> = []
  let text = ""
  const push = (token?: Token) => {
    for (const word of text.split(/\s+/)) if (word !== "") tokens.push({ _tag: "Word", text: word })
    text = ""
    if (token !== undefined) tokens.push(token)
  }
  const walker = block.walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    const { node } = step
    if (!step.entering) continue
    if (node.type === "text") text += node.literal ?? ""
    else if (node.type === "softbreak" || node.type === "linebreak") push({ _tag: "Break" })
    else if (node.type === "code" || node.type === "html_inline") push({ _tag: "Opaque" })
    else if (node.type === "link" || node.type === "image") {
      push(node.type === "link" ? linkToken(node) : { _tag: "Opaque" })
      walker.resumeAt(node, false)
    }
  }
  push()
  return tokens
}

/** The issue that `token`, a word or a link destination, names, if valid. */
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

const referenceReader = (repository: RepoRef, forgejoUrl: string) => {
  const base = new URL(forgejoUrl)
  const prefix = base.pathname.replace(/\/$/, "")
  return (token: string) => referenceOf(token, repository, base, prefix)
}

const tokenReference = (
  token: Token | undefined,
  named: (token: string) => EpicReference | undefined,
): EpicReference | undefined => {
  if (token?._tag === "Word") return named(token.text)
  if (token?._tag !== "Link") return undefined
  return (
    named(firstWord(token.label)) ??
    (/^https?:\/\//i.test(token.destination) ? named(token.destination) : undefined)
  )
}

/** The token a list item's first line starts with, after its checkbox, read from the source. */
const itemToken = (paragraph: Node, lines: ReadonlyArray<string>) => {
  const [[line, column]] = paragraph.sourcepos
  return leadingToken((lines[line - 1]?.slice(column - 1) ?? "").replace(CHECKBOX, ""))
}

const word = (token: Token | undefined) =>
  token?._tag === "Word" ? token.text.toLowerCase() : undefined

// CommonMark parses the `(` of `(<https://…>)` as text apart from the autolink.
const referenceToken = (tokens: ReadonlyArray<Token>, i: number) => {
  const token = tokens[i]
  return token?._tag === "Word" && /^[(<[*_]+$/.test(token.text) ? tokens[i + 1] : token
}

const isParentHeading = (tokens: ReadonlyArray<Token>, words: ReadonlyArray<string>) =>
  tokens.every((token) => token._tag === "Word") &&
  words.includes(tokens.map(word).join(" ").replace(/:$/, ""))

const openingToken = (block: Node | null, lines: ReadonlyArray<string>) => {
  let next = block
  while (next?.type === "html_block") next = next.next
  if (next?.type === "list") {
    const paragraph = next.firstChild?.firstChild
    return paragraph?.type === "paragraph" ? itemToken(paragraph, lines) : undefined
  }
  return next?.type === "paragraph" ? referenceToken(inlineTokens(next), 0) : undefined
}

/** The words of the heading and line forms, and whether `part of` counts. */
type ParentForms = { readonly words: ReadonlyArray<string>; readonly phrase: boolean }

const parentsNamed = (
  body: string,
  repository: RepoRef,
  forgejoUrl: string,
  { words, phrase }: ParentForms,
): ReadonlyArray<EpicReference> => {
  const named = referenceReader(repository, forgejoUrl)
  const labels = words.map((label) => `${label}:`)
  const lines = body.split(LINE)
  const parents = new Map<string, EpicReference>()
  const add = (token: Token | undefined) => {
    const reference = tokenReference(token, named)
    if (reference !== undefined && !parents.has(reference.ref))
      parents.set(reference.ref, reference)
  }
  const walker = new Parser().parse(body).walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    const { node } = step
    if (!step.entering) continue
    if (node.type === "block_quote") walker.resumeAt(node, false)
    if (node.type !== "paragraph" && node.type !== "heading") continue
    walker.resumeAt(node, false)
    const tokens = inlineTokens(node)
    if (node.type === "heading" && isParentHeading(tokens, words))
      add(openingToken(node.next, lines))
    tokens.forEach((token, i) => {
      const before = tokens[i - 1]
      const lineStart = before === undefined || before._tag === "Break"
      if (lineStart && labels.includes(word(token) ?? "")) add(referenceToken(tokens, i + 1))
      if (
        phrase &&
        (word(token) === "part" || word(token) === "(part") &&
        (word(tokens[i + 1]) === "of" || word(tokens[i + 1]) === "of:") &&
        (lineStart || /[.!?:]$/.test(word(before) ?? "") || word(before) === "is")
      )
        add(referenceToken(tokens, i + 2))
    })
  }
  return [...parents.values()]
}

/**
 * The issues that the list items of an epic's body reference, in body order. The body is parsed
 * as CommonMark, as Forgejo renders it, so code and HTML never hold list items. The reference
 * comes from the source text of each item's first line, after an optional task checkbox. A
 * leading inline link names its issue by its text or, failing that, its destination. The issue a
 * `Parent` heading or `Parent:` line names is the epic's own parent, not its child; `part of` and
 * an `Epic` heading do not count here, because an epic's own description uses them for other
 * things.
 */
export const parseEpicChildren = (
  body: string,
  repository: RepoRef,
  forgejoUrl: string,
): ReadonlyArray<EpicReference> => {
  const named = referenceReader(repository, forgejoUrl)
  const parents = new Set(
    parentsNamed(body, repository, forgejoUrl, { words: ["parent"], phrase: false }).map(
      ({ ref }) => ref,
    ),
  )
  const children = new Map<string, EpicReference>()
  const lines = body.split(LINE)
  const walker = new Parser().parse(body).walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    const paragraph = step.node.firstChild
    if (!step.entering || step.node.type !== "item" || paragraph?.type !== "paragraph") continue
    const reference = tokenReference(itemToken(paragraph, lines), named)
    if (reference === undefined || parents.has(reference.ref)) continue
    children.set(reference.ref, reference)
    if (children.size === MAX_CHILDREN) break
  }
  return [...children.values()]
}

/**
 * The issues that an issue's description names as its parent, in body order, each once.
 * `repository` is the describing issue's own, so `#12` means its #12. The forms are `part of
 * <ref>` or `part of: <ref>` (opening a line, after a sentence end, or after "is"), a line that
 * starts `Parent:` or `Epic:` and a reference, and a `Parent` or `Epic` heading whose next block
 * starts with a reference. Code, HTML, and block quotes name no parent; a quote is someone
 * else's words.
 */
export const parseEpicParents = (
  body: string,
  repository: RepoRef,
  forgejoUrl: string,
): ReadonlyArray<EpicReference> =>
  parentsNamed(body, repository, forgejoUrl, { words: ["parent", "epic"], phrase: true })
