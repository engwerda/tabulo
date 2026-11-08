import { type QueryClient, useQuery } from "@tanstack/react-query"
import type { User } from "../shared/api.ts"
import { fetchSessionUser } from "./api.ts"
import { claimStorage, forgetUserData, type KeyValueStorage, OWNER_KEY } from "./stored-data.ts"

export const SESSION_USER = ["session-user"] as const

export const useSession = () => useQuery({ queryKey: SESSION_USER, queryFn: fetchSessionUser })

/** The signed-in user; only for components that render after App has seen the session. */
export const useViewer = (): User => {
  const session = useSession()
  if (session.data === undefined || session.data === null) throw new Error("No signed-in user")
  return session.data
}

const browserStorages = (): ReadonlyArray<KeyValueStorage> => {
  try {
    return [window.localStorage, window.sessionStorage]
  } catch {
    return []
  }
}

export const forgetSignedInUser = () => {
  for (const storage of browserStorages()) {
    try {
      forgetUserData(storage)
    } catch {}
  }
}

export const keepDataToSessionUser = (queryClient: QueryClient) => {
  let shownFor: number | null | undefined
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return
    if (event.query.queryKey[0] !== SESSION_USER[0]) return
    const userId = (event.query.state.data as User | null)?.id ?? null
    if (userId !== null) {
      for (const storage of browserStorages()) {
        try {
          claimStorage(storage, userId)
        } catch {}
      }
      if (shownFor !== undefined && userId !== shownFor) window.location.reload()
    }
    shownFor = userId
  })
  window.addEventListener("storage", (event) => {
    if (event.key === OWNER_KEY) void queryClient.invalidateQueries({ queryKey: SESSION_USER })
  })
}
