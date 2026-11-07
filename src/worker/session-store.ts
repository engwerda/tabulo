import { Clock, Context, Effect, Redacted } from "effect"
import type { User } from "../shared/api.ts"
import { OAuthStateInvalid, SessionNotFound } from "./errors.ts"
import type { TokenGrant } from "./forgejo/client.ts"
import type { ForgejoUser } from "./forgejo/schemas.ts"
import { decryptToken, encryptToken, randomToken, sha256Hex } from "./token-crypto.ts"

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000

export type Session = {
  readonly idHash: string
  readonly forgejoUserId: number
  readonly user: User
  readonly tokens: TokenGrant
}

export class SessionStore extends Context.Service<
  SessionStore,
  {
    /** Returns the cookie value. Only its SHA-256 hash is stored. */
    readonly create: (user: ForgejoUser, tokens: TokenGrant) => Effect.Effect<string>
    readonly find: (cookieValue: string) => Effect.Effect<Session, SessionNotFound>
    readonly replaceTokens: (idHash: string, tokens: TokenGrant) => Effect.Effect<void>
    readonly remove: (idHash: string) => Effect.Effect<void>
    readonly saveOAuthState: (state: string, codeVerifier: string) => Effect.Effect<void>
    /** Consumes the state: a second call with the same value fails. */
    readonly takeOAuthState: (state: string) => Effect.Effect<string, OAuthStateInvalid>
  }
>()("tabulo/SessionStore") {}

type SessionRow = {
  id_hash: string
  forgejo_user_id: number
  login: string
  name: string
  avatar_url: string
  access_token_enc: string
  refresh_token_enc: string
  access_expires_at: number
  expires_at: number
}

// D1 failures are infrastructure faults, not domain outcomes, so they surface as defects.
const query = <A>(run: () => Promise<A>) => Effect.promise(run)

export const makeSessionStore = (db: D1Database, key: CryptoKey): SessionStore["Service"] => {
  const sealTokens = (idHash: string, tokens: TokenGrant) =>
    Effect.all([
      encryptToken(key, Redacted.value(tokens.accessToken), `${idHash}:access`),
      encryptToken(key, Redacted.value(tokens.refreshToken), `${idHash}:refresh`),
    ])

  const openTokens = (row: SessionRow) =>
    Effect.all([
      decryptToken(key, row.access_token_enc, `${row.id_hash}:access`),
      decryptToken(key, row.refresh_token_enc, `${row.id_hash}:refresh`),
    ]).pipe(
      Effect.map(([access, refresh]) => ({
        accessToken: Redacted.make(access),
        refreshToken: Redacted.make(refresh),
        accessExpiresAt: row.access_expires_at,
      })),
    )

  const remove = (idHash: string) =>
    query(() => db.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run()).pipe(
      Effect.asVoid,
    )

  return {
    create: (user, tokens) =>
      Effect.gen(function* () {
        const cookieValue = randomToken()
        const idHash = yield* sha256Hex(cookieValue)
        const [accessEnc, refreshEnc] = yield* sealTokens(idHash, tokens)
        const now = yield* Clock.currentTimeMillis
        yield* query(() =>
          db.batch([
            db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
            db
              .prepare(
                `INSERT INTO sessions (id_hash, forgejo_user_id, login, name, avatar_url,
                   access_token_enc, refresh_token_enc, access_expires_at, created_at, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                idHash,
                user.id,
                user.login,
                user.full_name.trim() || user.login,
                user.avatar_url,
                accessEnc,
                refreshEnc,
                tokens.accessExpiresAt,
                now,
                now + SESSION_LIFETIME_MS,
              ),
          ]),
        )
        return cookieValue
      }),

    find: (cookieValue) =>
      Effect.gen(function* () {
        const idHash = yield* sha256Hex(cookieValue)
        const row = yield* query(() =>
          db.prepare("SELECT * FROM sessions WHERE id_hash = ?").bind(idHash).first<SessionRow>(),
        )
        if (row === null) return yield* new SessionNotFound()
        if (row.expires_at <= (yield* Clock.currentTimeMillis)) {
          yield* remove(idHash)
          return yield* new SessionNotFound()
        }
        const tokens = yield* openTokens(row).pipe(
          Effect.catch(() => remove(idHash).pipe(Effect.andThen(new SessionNotFound()))),
        )
        return {
          idHash,
          forgejoUserId: row.forgejo_user_id,
          user: { login: row.login, name: row.name, avatarUrl: row.avatar_url },
          tokens,
        }
      }),

    replaceTokens: (idHash, tokens) =>
      Effect.gen(function* () {
        const [accessEnc, refreshEnc] = yield* sealTokens(idHash, tokens)
        yield* query(() =>
          db
            .prepare(
              `UPDATE sessions SET access_token_enc = ?, refresh_token_enc = ?, access_expires_at = ?
               WHERE id_hash = ?`,
            )
            .bind(accessEnc, refreshEnc, tokens.accessExpiresAt, idHash)
            .run(),
        )
      }),

    remove,

    saveOAuthState: (state, codeVerifier) =>
      Effect.gen(function* () {
        const stateHash = yield* sha256Hex(state)
        const now = yield* Clock.currentTimeMillis
        yield* query(() =>
          db.batch([
            db
              .prepare("DELETE FROM oauth_states WHERE created_at <= ?")
              .bind(now - OAUTH_STATE_LIFETIME_MS),
            db
              .prepare(
                "INSERT INTO oauth_states (state_hash, code_verifier, created_at) VALUES (?, ?, ?)",
              )
              .bind(stateHash, codeVerifier, now),
          ]),
        )
      }),

    takeOAuthState: (state) =>
      Effect.gen(function* () {
        const stateHash = yield* sha256Hex(state)
        const row = yield* query(() =>
          db
            .prepare(
              "DELETE FROM oauth_states WHERE state_hash = ? RETURNING code_verifier, created_at",
            )
            .bind(stateHash)
            .first<{ code_verifier: string; created_at: number }>(),
        )
        const now = yield* Clock.currentTimeMillis
        if (row === null || row.created_at <= now - OAUTH_STATE_LIFETIME_MS) {
          return yield* new OAuthStateInvalid()
        }
        return row.code_verifier
      }),
  }
}
