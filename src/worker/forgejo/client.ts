import { Clock, Context, Effect, Redacted, Schema } from "effect"
import {
  ForgejoDecodeFailed,
  type ForgejoError,
  ForgejoRequestFailed,
  ForgejoUnauthorized,
  ForgejoUnreachable,
  OAuthGrantRejected,
} from "../errors.ts"
import {
  ForgejoIssue,
  ForgejoNotification,
  ForgejoUser,
  OAuthErrorResponse,
  TokenResponse,
} from "./schemas.ts"

export type HttpFetch = (request: Request) => Promise<Response>

export type ForgejoConfig = {
  /** No trailing slash. */
  readonly baseUrl: string
  readonly clientId: string
  readonly clientSecret: Redacted.Redacted<string>
  readonly redirectUri: string
}

export type AccessToken = Redacted.Redacted<string>

export type TokenGrant = {
  readonly accessToken: AccessToken
  readonly refreshToken: Redacted.Redacted<string>
  /** Epoch milliseconds. */
  readonly accessExpiresAt: number
}

export type Page<A> = { readonly items: ReadonlyArray<A>; readonly total: number }

export type IssueSearch = "review_requested" | "assigned" | "mentioned" | "created"

export class ForgejoClient extends Context.Service<
  ForgejoClient,
  {
    readonly authorizeUrl: (state: string, codeChallenge: string) => string
    readonly exchangeCode: (
      code: string,
      codeVerifier: string,
    ) => Effect.Effect<TokenGrant, ForgejoError | OAuthGrantRejected>
    readonly refresh: (
      refreshToken: Redacted.Redacted<string>,
    ) => Effect.Effect<TokenGrant, ForgejoError | OAuthGrantRejected>
    readonly currentUser: (token: AccessToken) => Effect.Effect<ForgejoUser, ForgejoError>
    readonly searchIssues: (
      token: AccessToken,
      search: IssueSearch,
      limit: number,
    ) => Effect.Effect<Page<ForgejoIssue>, ForgejoError>
    readonly unreadNotifications: (
      token: AccessToken,
      limit: number,
    ) => Effect.Effect<Page<ForgejoNotification>, ForgejoError>
  }
>()("tabulo/ForgejoClient") {}

const send = (fetch: HttpFetch, request: Request) =>
  Effect.tryPromise({
    try: () => fetch(request),
    catch: (cause) => new ForgejoUnreachable({ message: String(cause) }),
  })

const readJson = <A>(response: Response, schema: Schema.Decoder<A>) =>
  Effect.tryPromise({
    try: () => response.json(),
    catch: () => new ForgejoDecodeFailed({ message: "response body is not JSON" }),
  }).pipe(
    Effect.flatMap((json) =>
      Schema.decodeUnknownEffect(schema)(json).pipe(
        Effect.mapError((error) => new ForgejoDecodeFailed({ message: error.message })),
      ),
    ),
  )

/** `X-Total-Count` is the number of matches across all pages. */
const totalCount = (response: Response, fallback: number) => {
  const total = Number.parseInt(response.headers.get("x-total-count") ?? "", 10)
  return Number.isNaN(total) ? fallback : total
}

export const makeForgejoClient = (
  config: ForgejoConfig,
  fetch: HttpFetch,
): ForgejoClient["Service"] => {
  const api = <A>(
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    schema: Schema.Decoder<A>,
  ) =>
    Effect.gen(function* () {
      const url = `${config.baseUrl}/api/v1${path}?${new URLSearchParams(query)}`
      const response = yield* send(
        fetch,
        new Request(url, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${Redacted.value(token)}`,
          },
        }),
      )
      if (response.status === 401) return yield* new ForgejoUnauthorized()
      if (!response.ok) return yield* new ForgejoRequestFailed({ status: response.status })
      const body = yield* readJson(response, schema)
      return { body, response }
    })

  const page = <A>(
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    item: Schema.Decoder<A>,
  ) =>
    api(token, path, query, Schema.Array(item)).pipe(
      Effect.map(({ body, response }) => ({
        items: body,
        total: totalCount(response, body.length),
      })),
    )

  const tokenRequest = (grant: Record<string, string>) =>
    Effect.gen(function* () {
      const response = yield* send(
        fetch,
        new Request(`${config.baseUrl}/login/oauth/access_token`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: Redacted.value(config.clientSecret),
            ...grant,
          }),
        }),
      )
      if (!response.ok) {
        // Forgejo answers every token error with 400. invalid_grant (grant revoked) and
        // unauthorized_client (refresh token expired, unparseable, or already used) mean the
        // grant is dead or rotated. invalid_client (rotated client secret), rate limiters and
        // WAFs must not end sessions. See handleRefreshToken in Forgejo's oauth.go.
        const error = yield* readJson(response, OAuthErrorResponse).pipe(
          Effect.map((body) => body.error),
          Effect.orElseSucceed(() => undefined),
        )
        if (
          response.status === 400 &&
          (error === "invalid_grant" || error === "unauthorized_client")
        ) {
          return yield* new OAuthGrantRejected()
        }
        return yield* new ForgejoRequestFailed({ status: response.status })
      }
      const tokens = yield* readJson(response, TokenResponse)
      const now = yield* Clock.currentTimeMillis
      return {
        accessToken: Redacted.make(tokens.access_token),
        refreshToken: Redacted.make(tokens.refresh_token),
        accessExpiresAt: now + tokens.expires_in * 1000,
      }
    })

  return {
    authorizeUrl: (state, codeChallenge) =>
      `${config.baseUrl}/login/oauth/authorize?${new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      })}`,
    exchangeCode: (code, codeVerifier) =>
      tokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: config.redirectUri,
      }),
    refresh: (refreshToken) =>
      tokenRequest({ grant_type: "refresh_token", refresh_token: Redacted.value(refreshToken) }),
    currentUser: (token) =>
      api(token, "/user", {}, ForgejoUser).pipe(Effect.map(({ body }) => body)),
    searchIssues: (token, search, limit) =>
      page(
        token,
        "/repos/issues/search",
        {
          state: "open",
          limit: String(limit),
          [search]: "true",
          ...(search === "review_requested" ? { type: "pulls" } : {}),
        },
        ForgejoIssue,
      ),
    unreadNotifications: (token, limit) =>
      page(token, "/notifications", { limit: String(limit) }, ForgejoNotification),
  }
}
