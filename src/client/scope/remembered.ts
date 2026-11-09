import { useSyncExternalStore } from "react"
import { DEFAULT_BOARD_ID } from "../../shared/api.ts"
import type { KeyValueStorage } from "../stored-data.ts"

export type LastScope = {
  readonly org: string
  readonly repos: ReadonlyArray<string>
  readonly board: string
}

const LAST_ORG_KEY = "tabulo.lastOrg"
const reposKey = (org: string) => `tabulo.repos.${org.toLowerCase()}`
// Before the scope was shared between views, only the board remembered a selection.
const boardReposKey = (org: string) => `tabulo.board.repos.${org.toLowerCase()}`
const lastBoardKey = (org: string) => `tabulo.board.last.${org.toLowerCase()}`

// Not `window.localStorage`: the tests run in a worker, which has no window, and put a storage on
// `globalThis` themselves.
const storage = () => (globalThis as { readonly localStorage?: KeyValueStorage }).localStorage

// Remembering the scope is a convenience: storage can be missing or refuse writes.
const read = (key: string) => {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) storage()?.removeItem(key)
    else storage()?.setItem(key, value)
  } catch {}
}

const parseRepos = (selection: string | null) =>
  (selection ?? "").split(",").filter((name) => name !== "")

/**
 * The comma-separated repositories remembered for `org`: `""` when the user chose none, so a
 * later visit does not choose any, and `null` when the organization was never chosen for.
 */
export const readRememberedRepos = (org: string): string | null =>
  read(reposKey(org)) ?? read(boardReposKey(org))

export const rememberedBoard = (org: string): string => read(lastBoardKey(org)) ?? DEFAULT_BOARD_ID

export const rememberedScope = (org: string): LastScope => ({
  org,
  repos: parseRepos(readRememberedRepos(org)),
  board: rememberedBoard(org),
})

const readLastScope = (): LastScope | null => {
  const org = read(LAST_ORG_KEY)
  return org ? rememberedScope(org) : null
}

let lastScope = readLastScope()
const listeners = new Set<() => void>()

const publish = (next: LastScope) => {
  if (
    lastScope?.org === next.org &&
    lastScope.repos.join(",") === next.repos.join(",") &&
    lastScope.board === next.board
  ) {
    return
  }
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
  publish({
    org,
    repos: parseRepos(selection || readRememberedRepos(org)),
    board: rememberedBoard(org),
  })
}

/** Remembers that the user chose no repositories of `org`. */
export const forgetRepos = (org: string) => {
  write(reposKey(org), "")
  write(boardReposKey(org), null)
  if (lastScope?.org === org) publish({ ...lastScope, repos: [] })
}

export const rememberBoard = (org: string, board: string) => {
  write(LAST_ORG_KEY, org)
  write(lastBoardKey(org), board === DEFAULT_BOARD_ID ? null : board)
  publish({ org, repos: parseRepos(readRememberedRepos(org)), board })
}

export const forgetBoard = (org: string, board: string): boolean => {
  if (board === DEFAULT_BOARD_ID || rememberedBoard(org) !== board) return false
  write(lastBoardKey(org), null)
  if (lastScope?.org.toLowerCase() === org.toLowerCase()) {
    publish({ ...lastScope, board: DEFAULT_BOARD_ID })
  }
  return true
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useLastScope = (): LastScope | null => useSyncExternalStore(subscribe, () => lastScope)
