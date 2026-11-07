import { Effect } from "effect"
import { OAuthCallbackInvalid, OAuthStateInvalid } from "../errors.ts"
import { ForgejoClient } from "../forgejo/client.ts"
import { SessionStore } from "../session-store.ts"
import { pkceChallenge, randomToken } from "../token-crypto.ts"

/** Stores a fresh state and PKCE verifier, and returns where to send the browser. */
export const beginLogin = Effect.gen(function* () {
  const forgejo = yield* ForgejoClient
  const store = yield* SessionStore
  const state = randomToken()
  const codeVerifier = randomToken()
  yield* store.saveOAuthState(state, codeVerifier)
  return { state, authorizeUrl: forgejo.authorizeUrl(state, yield* pkceChallenge(codeVerifier)) }
})

export type CallbackParams = {
  readonly code: string | undefined
  readonly state: string | undefined
  /** The state this browser was given at login; it binds the callback to that browser. */
  readonly browserState: string | undefined
}

/** Exchanges the authorization code and creates a session. Returns the session cookie value. */
export const completeLogin = ({ code, state, browserState }: CallbackParams) =>
  Effect.gen(function* () {
    if (code === undefined || state === undefined) {
      return yield* new OAuthCallbackInvalid({ message: "code and state are required" })
    }
    const store = yield* SessionStore
    const codeVerifier = yield* store.takeOAuthState(state)
    if (state !== browserState) return yield* new OAuthStateInvalid()

    const forgejo = yield* ForgejoClient
    const tokens = yield* forgejo.exchangeCode(code, codeVerifier)
    const user = yield* forgejo.currentUser(tokens.accessToken)
    return yield* store.create(user, tokens)
  })
