import { type QueryClient, useQuery } from "@tanstack/react-query"
import type { User } from "../shared/api.ts"
import { fetchSessionUser } from "./api.ts"

export const SESSION_USER = ["session-user"] as const

export const useSession = () => useQuery({ queryKey: SESSION_USER, queryFn: fetchSessionUser })

/** The signed-in user; only for components that render after App has seen the session. */
export const useViewer = (): User => {
  const session = useSession()
  if (session.data === undefined || session.data === null) throw new Error("No signed-in user")
  return session.data
}

/**
 * The login whose remembered choices and drafts a storage holds. Each storage records its own,
 * because another tab can change local storage but never this tab's session storage.
 */
const OWNER_KEY = "tabulo.user"
/** Storage that belongs to no user: the theme, and the address to open after signing in. */
const SHARED_KEYS = new Set(["tabulo.theme", "tabulo.returnTo"])

/** Gives browser storage to `login`, first removing what another user, or nobody, left there. */
const claimStorage = (login: string | null) => {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[name]
      if (storage.getItem(OWNER_KEY) === login) continue
      for (const key of Object.keys(storage)) {
        if (key.startsWith("tabulo.") && !SHARED_KEYS.has(key)) storage.removeItem(key)
      }
      if (login !== null) storage.setItem(OWNER_KEY, login)
    } catch {}
  }
}

/**
 * Keeps what the browser holds to the signed-in user. When the session ends, browser storage is
 * cleared. When another user's session replaces it, as after signing out and in again in
 * another tab, the page reloads, so no cached query or remembered choice of the previous user
 * stays in memory. A change of user in another tab makes this tab check its session at once.
 */
export const keepDataToSessionUser = (queryClient: QueryClient) => {
  let shownFor: string | null | undefined
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return
    if (event.query.queryKey[0] !== SESSION_USER[0]) return
    const login = (event.query.state.data as User | null)?.login ?? null
    claimStorage(login)
    if (shownFor !== undefined && login !== null && login !== shownFor) {
      window.location.reload()
    }
    shownFor = login
  })
  window.addEventListener("storage", (event) => {
    if (event.key === OWNER_KEY) void queryClient.invalidateQueries({ queryKey: SESSION_USER })
  })
}
