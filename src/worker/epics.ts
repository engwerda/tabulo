import type { RepoRef } from "./forgejo/client.ts"

export type EpicReference = RepoRef & { readonly number: number; readonly ref: string }

const MAX_CHILDREN = 200
const NAME = "[A-Za-z0-9_.-]+"
const SHORT_REF = new RegExp(`^(?:(?:(${NAME})/)?(${NAME}))?#([1-9][0-9]*)$`)

export const parseEpicChildren = (
  body: string,
  repository: RepoRef,
  forgejoUrl: string,
): ReadonlyArray<EpicReference> => {
  const base = new URL(forgejoUrl)
  const prefix = base.pathname.replace(/\/$/, "")
  const children = new Map<string, EpicReference>()
  let fence: { marker: string; length: number } | undefined
  for (const line of body.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence !== undefined) {
      if (
        marker?.[1]?.[0] === fence.marker &&
        marker[1].length >= fence.length &&
        marker[2]?.trim() === ""
      )
        fence = undefined
      continue
    }
    if (marker?.[1] !== undefined) {
      fence = { marker: marker[1][0] ?? "", length: marker[1].length }
      continue
    }
    const task = /^\s*[-*+][\t ]+\[[ xX]\]\s+(\S+)(?:\s|$)/.exec(line)
    if (task?.[1] === undefined) continue
    const target = task[1].replace(/^<(.+)>$/, "$1")
    let owner = repository.owner
    let name = repository.name
    let number: number
    const short = SHORT_REF.exec(target)
    if (short !== null) {
      owner = short[1] ?? owner
      name = short[2] ?? name
      number = Number(short[3])
    } else {
      if (!URL.canParse(target)) continue
      const url = new URL(target)
      if (url.origin !== base.origin || !url.pathname.startsWith(`${prefix}/`)) continue
      const path = url.pathname.slice(prefix.length)
      const issue = new RegExp(`^/(${NAME})/(${NAME})/issues/([1-9][0-9]*)/?$`).exec(path)
      if (issue === null) continue
      owner = issue[1] ?? owner
      name = issue[2] ?? name
      number = Number(issue[3])
    }
    if (
      !Number.isSafeInteger(number) ||
      [owner, name].some((part) => part === "." || part === "..")
    )
      continue
    owner = owner.toLowerCase()
    name = name.toLowerCase()
    const ref = `${owner}/${name}#${number}`
    children.set(ref, { owner, name, number, ref })
    if (children.size === MAX_CHILDREN) break
  }
  return [...children.values()]
}
