import { Cause, Clock, Effect, Exit } from "effect"
import { type Context, Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import type { Dashboard } from "../shared/api.ts"
import { beginLogin, completeLogin } from "./auth/oauth.ts"
import { currentSession, withAccessToken } from "./auth/session.ts"
import { loadConfig } from "./config.ts"
import { loadDashboardSections } from "./dashboard.ts"
import type {
  ConfigInvalid,
  ForgejoError,
  OAuthCallbackInvalid,
  OAuthGrantRejected,
  OAuthStateInvalid,
  SessionNotFound,
} from "./errors.ts"
import { ForgejoClient, type HttpFetch, makeForgejoClient } from "./forgejo/client.ts"
import {
  makeSessionStore,
  OAUTH_STATE_LIFETIME_MS,
  SESSION_LIFETIME_MS,
  SessionStore,
} from "./session-store.ts"
import { sha256Hex } from "./token-crypto.ts"

export type Dependencies = {
  /** Outbound HTTP to Forgejo. Tests pass a fake Forgejo here. */
  readonly fetch: HttpFetch
  /** Tests pass a clock they control. */
  readonly clock?: Clock.Clock | undefined
}

type AppError =
  | ConfigInvalid
  | ForgejoError
  | OAuthCallbackInvalid
  | OAuthGrantRejected
  | OAuthStateInvalid
  | SessionNotFound

type AppContext = Context<{ Bindings: Env }>

// The __Host- prefix makes browsers reject the cookie unless it is Secure, has Path=/,
// and has no Domain, so a sibling subdomain cannot overwrite it.
const SESSION_COOKIE = "__Host-tabulo_session"
const OAUTH_STATE_COOKIE = "__Host-tabulo_oauth_state"

const cookieOptions = (maxAgeMs: number) =>
  ({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  }) as const

const unauthenticated = (c: AppContext) => {
  if (getCookie(c, SESSION_COOKIE) !== undefined) {
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true })
  }
  return c.json({ error: "unauthenticated" }, 401)
}

const errorResponse = (c: AppContext, error: AppError): Response => {
  switch (error._tag) {
    case "SessionNotFound":
    case "ForgejoUnauthorized":
      return unauthenticated(c)
    case "OAuthStateInvalid":
      return c.text("This sign-in link has expired or was already used. Sign in again.", 400)
    case "OAuthCallbackInvalid":
      return c.text(`Invalid sign-in callback: ${error.message}`, 400)
    case "OAuthGrantRejected":
      return c.text("Forgejo rejected the sign-in. Sign in again.", 400)
    case "ForgejoRequestFailed":
      return c.json({ error: `Forgejo returned HTTP ${error.status}` }, 502)
    case "ForgejoUnreachable":
      return c.json({ error: "Forgejo is unreachable" }, 502)
    case "ForgejoDecodeFailed":
      return c.json({ error: "Forgejo sent an unexpected response" }, 502)
    case "ConfigInvalid":
      console.error(`Tabulo is misconfigured: ${error.message}`)
      return c.json({ error: "Tabulo is misconfigured" }, 500)
  }
}

export const createApp = (dependencies: Dependencies) => {
  const run = async (
    c: AppContext,
    program: Effect.Effect<Response, AppError, ForgejoClient | SessionStore>,
  ): Promise<Response> => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const config = yield* loadConfig(c.env)
        return yield* program.pipe(
          Effect.provideService(
            ForgejoClient,
            makeForgejoClient(config.forgejo, dependencies.fetch),
          ),
          Effect.provideService(SessionStore, makeSessionStore(c.env.DB, config.tokenKey)),
        )
      }).pipe(Effect.provideService(Clock.Clock, dependencies.clock ?? Clock.Clock.defaultValue())),
    )
    if (Exit.isSuccess(exit)) return exit.value
    const failure = exit.cause.reasons.find(Cause.isFailReason)
    if (failure !== undefined) return errorResponse(c, failure.error)
    console.error(Cause.pretty(exit.cause))
    return c.json({ error: "Internal error" }, 500)
  }

  const app = new Hono<{ Bindings: Env }>()

  app.use(async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next()
    const appOrigin = URL.canParse(c.env.APP_URL) ? new URL(c.env.APP_URL).origin : undefined
    if (appOrigin === undefined || c.req.header("origin") !== appOrigin) {
      return c.json({ error: "Cross-origin request refused" }, 403)
    }
    return next()
  })

  app.get("/auth/login", (c) =>
    run(
      c,
      Effect.map(beginLogin, ({ state, authorizeUrl }) => {
        setCookie(c, OAUTH_STATE_COOKIE, state, cookieOptions(OAUTH_STATE_LIFETIME_MS))
        return c.redirect(authorizeUrl, 302)
      }),
    ),
  )

  app.get("/auth/callback", async (c) => {
    // The user declined on Forgejo's consent page: back to the sign-in screen.
    if (c.req.query("error") !== undefined) return c.redirect("/", 302)
    const browserState = getCookie(c, OAUTH_STATE_COOKIE)
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/", secure: true })
    return run(
      c,
      Effect.map(
        completeLogin({
          code: c.req.query("code"),
          state: c.req.query("state"),
          browserState,
          previousSession: getCookie(c, SESSION_COOKIE),
        }),
        (cookieValue) => {
          setCookie(c, SESSION_COOKIE, cookieValue, cookieOptions(SESSION_LIFETIME_MS))
          return c.redirect("/", 302)
        },
      ),
    )
  })

  app.post("/auth/logout", (c) => {
    const cookieValue = getCookie(c, SESSION_COOKIE)
    const removal =
      cookieValue === undefined
        ? Effect.void
        : sha256Hex(cookieValue).pipe(
            Effect.flatMap((idHash) => SessionStore.use((store) => store.remove(idHash))),
          )
    return run(
      c,
      Effect.map(removal, () => {
        deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true })
        return c.body(null, 204)
      }),
    )
  })

  app.get("/api/me", (c) =>
    run(
      c,
      Effect.map(currentSession(getCookie(c, SESSION_COOKIE)), (session) => c.json(session.user)),
    ),
  )

  app.get("/api/dashboard", (c) =>
    run(
      c,
      withAccessToken(getCookie(c, SESSION_COOKIE), (token, session) =>
        loadDashboardSections(token).pipe(
          Effect.map((sections) => c.json({ user: session.user, ...sections } satisfies Dashboard)),
        ),
      ),
    ),
  )

  return app
}
