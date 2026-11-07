import { Clock, Effect, Redacted } from "effect"
import { ForgejoUnauthorized, SessionNotFound } from "../errors.ts"
import { type AccessToken, ForgejoClient } from "../forgejo/client.ts"
import { type Session, SessionStore } from "../session-store.ts"

/** Refresh this long before Forgejo would reject the access token. */
const REFRESH_MARGIN_MS = 60_000

export const currentSession = (cookieValue: string | undefined) =>
  cookieValue === undefined
    ? Effect.fail(new SessionNotFound())
    : SessionStore.use((store) => store.find(cookieValue))

const refresh = (cookieValue: string, session: Session) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const store = yield* SessionStore
    return yield* forgejo.refresh(session.tokens.refreshToken).pipe(
      Effect.tap((tokens) => store.replaceTokens(session.idHash, tokens)),
      Effect.map((tokens): Session => ({ ...session, tokens })),
      Effect.catchTag("OAuthGrantRejected", () =>
        // A concurrent request may have rotated the refresh token first; Forgejo then
        // rejects ours although the session holds a newer, valid one.
        store.find(cookieValue).pipe(
          Effect.flatMap((latest) =>
            Redacted.value(latest.tokens.refreshToken) ===
            Redacted.value(session.tokens.refreshToken)
              ? Effect.fail(new ForgejoUnauthorized())
              : Effect.succeed(latest),
          ),
          Effect.catchTag("SessionNotFound", () => Effect.fail(new ForgejoUnauthorized())),
        ),
      ),
    )
  })

/**
 * Runs `use` with a valid access token for the session in `cookieValue`. The token is
 * refreshed when it is about to expire, and once more if Forgejo rejects it. When Forgejo
 * still rejects the user, the session is deleted and the effect fails with
 * `ForgejoUnauthorized`.
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
    const expiring = session.tokens.accessExpiresAt - REFRESH_MARGIN_MS <= now
    const run = (current: Session) => use(current.tokens.accessToken, current)
    const attempt = expiring
      ? refresh(cookieValue, session).pipe(Effect.flatMap(run))
      : run(session).pipe(
          Effect.catchTag("ForgejoUnauthorized", () =>
            refresh(cookieValue, session).pipe(Effect.flatMap(run)),
          ),
        )
    return yield* attempt.pipe(
      Effect.tapErrorTag("ForgejoUnauthorized", () => store.remove(session.idHash)),
    )
  })
