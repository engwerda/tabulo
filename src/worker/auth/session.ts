import { Clock, Effect, Schedule } from "effect"
import { ForgejoUnauthorized, SessionNotFound } from "../errors.ts"
import { type AccessToken, ForgejoClient } from "../forgejo/client.ts"
import { type Session, SessionStore } from "../session-store.ts"

/** Refresh this long before Forgejo would reject the access token. */
const REFRESH_MARGIN_MS = 60_000

/**
 * How long a rejected refresh waits for a concurrent request, possibly in
 * another isolate, to store the tokens it got for the same refresh token. Forgejo rotates
 * refresh tokens, so the loser of that race is rejected before the winner has written.
 */
const CONCURRENT_REFRESH_WAIT = { schedule: Schedule.spaced("200 millis"), times: 10 }

export const currentSession = (cookieValue: string | undefined) =>
  cookieValue === undefined
    ? Effect.fail(new SessionNotFound())
    : SessionStore.use((store) => store.find(cookieValue))

const awaitConcurrentRefresh = (session: Session) =>
  SessionStore.use((store) =>
    store.reload(session).pipe(
      Effect.filterOrFail(
        (latest) => latest.tokenVersion !== session.tokenVersion,
        () => new ForgejoUnauthorized(),
      ),
      Effect.retry({
        ...CONCURRENT_REFRESH_WAIT,
        while: (error) => error._tag === "ForgejoUnauthorized",
      }),
      // Nobody stored newer tokens, so the refresh token itself is dead.
      Effect.tapErrorTag("ForgejoUnauthorized", () => store.removeIfCurrent(session)),
    ),
  )

/**
 * The session with the user as Forgejo names them now, so a rename reaches Tabulo within one
 * access token's lifetime. A failed read keeps the stored user.
 */
const reloadUser = (session: Session) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const store = yield* SessionStore
    const user = yield* forgejo.currentUser(session.tokens.accessToken)
    return yield* store.updateUser(session, user)
  }).pipe(Effect.catch(() => Effect.succeed(session)))

const refresh = (session: Session) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const store = yield* SessionStore
    return yield* forgejo.refresh(session.tokens.refreshToken).pipe(
      Effect.flatMap((tokens) => store.replaceTokens(session, tokens)),
      Effect.catchTag("OAuthGrantRejected", () => awaitConcurrentRefresh(session)),
      Effect.flatMap(reloadUser),
    )
  })

/**
 * Runs `use` with a valid access token for the session in `cookieValue`. The token is
 * refreshed when it is about to expire, and once more if Forgejo rejects it. When Forgejo
 * rejects the refresh token, or the refreshed access token, the session is deleted and the
 * effect fails with `ForgejoUnauthorized`.
 */
export const withAccessToken = <A, E, R>(
  cookieValue: string | undefined,
  use: (token: AccessToken, session: Session) => Effect.Effect<A, E | ForgejoUnauthorized, R>,
) =>
  Effect.gen(function* () {
    if (cookieValue === undefined) return yield* new SessionNotFound()
    const store = yield* SessionStore
    const session = yield* store.find(cookieValue)
    const now = yield* Clock.currentTimeMillis
    const run = (current: Session) => use(current.tokens.accessToken, current)
    const refreshThenRun = refresh(session).pipe(
      Effect.flatMap((current) =>
        run(current).pipe(
          Effect.tapErrorTag("ForgejoUnauthorized", () => store.removeIfCurrent(current)),
        ),
      ),
    )
    return yield* session.tokens.accessExpiresAt - REFRESH_MARGIN_MS <= now
      ? refreshThenRun
      : run(session).pipe(Effect.catchTag("ForgejoUnauthorized", () => refreshThenRun))
  })
