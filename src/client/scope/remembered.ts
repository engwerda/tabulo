import { useSyncExternalStore } from "react"

/** The organization last opened in an org-level view, with its remembered repositories. */
export type LastScope = { readonly org: string; readonly repos: ReadonlyArray<string> }

const LAST_ORG_KEY = "tabulo.lastOrg"
const reposKey = (org: string) => `tabulo.repos.${org.toLowerCase()}`
// Before the scope was shared between views, only the board remembered a selection.
const boardReposKey = (org: string) => `tabulo.board.repos.${org.toLowerCase()}`

// Remembering the scope is a convenience: storage can be missing or refuse writes.
const read = (key: string) => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {}
}

const parseRepos = (selection: string | null) =>
  (selection ?? "").split(",").filter((name) => name !== "")

/** The comma-separated repositories remembered for `org`, or `null` if none are. */
export const readRememberedRepos = (org: string): string | null =>
  read(reposKey(org)) || read(boardReposKey(org)) || null

const readLastScope = (): LastScope | null => {
  const org = read(LAST_ORG_KEY)
  return org ? { org, repos: parseRepos(readRememberedRepos(org)) } : null
}

let lastScope = readLastScope()
const listeners = new Set<() => void>()

const publish = (next: LastScope) => {
  if (lastScope?.org === next.org && lastScope.repos.join(",") === next.repos.join(",")) return
  lastScope = next
  for (const listener of listeners) listener()
}

/** Makes `org` the last scope and remembers `selection` for it unless the selection is empty. */
export const rememberScope = (org: string, selection: string) => {
  write(LAST_ORG_KEY, org)
  if (selection !== "") {
    write(reposKey(org), selection)
    write(boardReposKey(org), null)
  }
  publish({ org, repos: parseRepos(selection || readRememberedRepos(org)) })
}

export const forgetRepos = (org: string) => {
  write(reposKey(org), null)
  write(boardReposKey(org), null)
  if (lastScope?.org === org) publish({ org, repos: [] })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useLastScope = (): LastScope | null => useSyncExternalStore(subscribe, () => lastScope)
