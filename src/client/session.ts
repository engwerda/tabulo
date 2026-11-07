import { useQuery } from "@tanstack/react-query"
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
