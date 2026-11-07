import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import type { Clock } from "effect"
import { createApp } from "../src/worker/app.ts"

export const APP_URL = "https://tabulo.example"

export const tabulo = (
  forgejoFetch: (request: Request) => Promise<Response>,
  options: { readonly clock?: Clock.Clock } = {},
) => {
  const app = createApp({ fetch: forgejoFetch, ...options })
  return async (path: string, init?: RequestInit): Promise<Response> => {
    const ctx = createExecutionContext()
    const response = await app.fetch(new Request(`${APP_URL}${path}`, init), env, ctx)
    await waitOnExecutionContext(ctx)
    return response
  }
}

export type Call = ReturnType<typeof tabulo>

/** Name and value of each Set-Cookie header, plus its raw attribute string. */
export const setCookies = (response: Response) =>
  new Map(
    response.headers.getSetCookie().map((header) => {
      const [pair = "", ...attributes] = header.split(";").map((part) => part.trim())
      const [name = "", value = ""] = pair.split("=")
      return [name, { value, attributes }] as const
    }),
  )

export const SESSION_COOKIE = "__Host-tabulo_session"
export const OAUTH_STATE_COOKIE = "__Host-tabulo_oauth_state"

/** Starts a login and returns what the browser carries to Forgejo and back. */
export const startLogin = async (call: Call) => {
  const response = await call("/auth/login")
  const location = new URL(response.headers.get("location") ?? "")
  return {
    state: location.searchParams.get("state") ?? "",
    codeChallenge: location.searchParams.get("code_challenge") ?? "",
    browserState: setCookies(response).get(OAUTH_STATE_COOKIE)?.value ?? "",
  }
}

export const callback = (call: Call, query: Record<string, string>, browserState: string) =>
  call(`/auth/callback?${new URLSearchParams(query)}`, {
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${browserState}` },
  })

/** Runs the whole sign-in against `forgejo` and returns the session cookie header. */
export const signIn = async (
  call: Call,
  forgejo: { approve: (codeChallenge: string) => string },
) => {
  const login = await startLogin(call)
  const code = forgejo.approve(login.codeChallenge)
  const response = await callback(call, { code, state: login.state }, login.browserState)
  const session = setCookies(response).get(SESSION_COOKIE)
  if (session === undefined) throw new Error(`sign-in failed with HTTP ${response.status}`)
  return `${SESSION_COOKIE}=${session.value}`
}
