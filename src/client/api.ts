import { Schema } from "effect"
import { Dashboard, User } from "../shared/api.ts"

/** The server answered 401: there is no usable session. */
export class Unauthenticated extends Error {
  constructor() {
    super("Not signed in")
  }
}

export class RequestFailed extends Error {}

const decodeUser = Schema.decodeUnknownPromise(User)
const decodeDashboard = Schema.decodeUnknownPromise(Dashboard)

const getJson = async (path: string): Promise<unknown> => {
  const response = await fetch(path, { headers: { accept: "application/json" } })
  if (response.status === 401) throw new Unauthenticated()
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown }
    throw new RequestFailed(
      typeof body.error === "string" ? body.error : `Tabulo returned HTTP ${response.status}`,
    )
  }
  return response.json()
}

/** The signed-in user, or `null` when the browser has no session. */
export const fetchSessionUser = async (): Promise<User | null> => {
  try {
    return await decodeUser(await getJson("/api/me"))
  } catch (error) {
    if (error instanceof Unauthenticated) return null
    throw error
  }
}

export const fetchDashboard = async (): Promise<Dashboard> =>
  decodeDashboard(await getJson("/api/dashboard"))

export const signOut = async (): Promise<void> => {
  const response = await fetch("/auth/logout", { method: "POST" })
  if (!response.ok) throw new RequestFailed(`Sign-out failed with HTTP ${response.status}`)
}
