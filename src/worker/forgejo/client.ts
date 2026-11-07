import { Clock, Context, Effect, Redacted, Schema } from "effect"
import {
  ForgejoDecodeFailed,
  type ForgejoError,
  ForgejoForbidden,
  ForgejoNotFound,
  ForgejoRequestFailed,
  ForgejoUnauthorized,
  ForgejoUnreachable,
  OAuthGrantRejected,
} from "../errors.ts"
import {
  ForgejoIssue,
  ForgejoLabel,
  ForgejoNotification,
  ForgejoOrg,
  ForgejoRepo,
  ForgejoRepoIssue,
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

/** A repository by owner and name, both already validated as path segments. */
export type RepoRef = { readonly owner: string; readonly name: string }

/** Which issues of a repository to list. Pull requests are never included. */
export type IssueListing =
  | { readonly state: "open" }
  | { readonly state: "closed"; readonly updatedSince: string }

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
    readonly userOrgs: (
      token: AccessToken,
    ) => Effect.Effect<ReadonlyArray<ForgejoOrg>, ForgejoError>
    readonly orgRepos: (
      token: AccessToken,
      org: string,
    ) => Effect.Effect<ReadonlyArray<ForgejoRepo>, ForgejoError>
    /** Whether `login` is a member of the organization. Ask only about the token's own user. */
    readonly isOrgMember: (
      token: AccessToken,
      org: string,
      login: string,
    ) => Effect.Effect<boolean, ForgejoError>
    readonly orgLabels: (
      token: AccessToken,
      org: string,
    ) => Effect.Effect<ReadonlyArray<ForgejoLabel>, ForgejoError>
    readonly repo: (token: AccessToken, repo: RepoRef) => Effect.Effect<ForgejoRepo, ForgejoError>
    readonly repoIssues: (
      token: AccessToken,
      repo: RepoRef,
      listing: IssueListing,
    ) => Effect.Effect<ReadonlyArray<ForgejoRepoIssue>, ForgejoError>
    readonly issue: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
    ) => Effect.Effect<ForgejoRepoIssue, ForgejoError>
    readonly setIssueState: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
      state: "open" | "closed",
    ) => Effect.Effect<ForgejoRepoIssue, ForgejoError>
    /**
     * Adds labels and answers with the issue's labels. Forgejo removes the issue's other labels
     * in each added label's exclusive scope in the same transaction and leaves the rest alone.
     */
    readonly addIssueLabels: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
      labelIds: ReadonlyArray<number>,
    ) => Effect.Effect<ReadonlyArray<ForgejoLabel>, ForgejoError>
    readonly removeIssueLabel: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
      labelId: number,
    ) => Effect.Effect<void, ForgejoError>
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

/** `X-Total-Count` is the number of matches across all pages, when Forgejo sends it. */
const totalCount = (response: Response) => {
  const total = Number.parseInt(response.headers.get("x-total-count") ?? "", 10)
  return Number.isNaN(total) ? undefined : total
}

// Forgejo caps every page at MAX_RESPONSE_ITEMS (50 by default), whatever `limit` asks for.
const knownTotal = <A>(page: {
  readonly items: ReadonlyArray<A>
  readonly total: number | undefined
}): Page<A> => ({ items: page.items, total: page.total ?? page.items.length })

const PAGE_SIZE = 50
const MAX_PAGES = 100

const repoPath = (repo: RepoRef) =>
  `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`

export const makeForgejoClient = (
  config: ForgejoConfig,
  fetch: HttpFetch,
): ForgejoClient["Service"] => {
  /** Sends an API request and turns error statuses into errors. */
  const request = (
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    write?:
      | { readonly method: "PATCH" | "POST"; readonly body: unknown }
      | { readonly method: "DELETE" },
  ) =>
    Effect.gen(function* () {
      const url = `${config.baseUrl}/api/v1${path}?${new URLSearchParams(query)}`
      const body = write !== undefined && "body" in write ? JSON.stringify(write.body) : undefined
      const response = yield* send(
        fetch,
        new Request(url, {
          method: write?.method ?? "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${Redacted.value(token)}`,
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body }),
        }),
      )
      if (response.status === 401) return yield* new ForgejoUnauthorized()
      if (response.status === 403) return yield* new ForgejoForbidden()
      if (response.status === 404) return yield* new ForgejoNotFound()
      if (!response.ok) return yield* new ForgejoRequestFailed({ status: response.status })
      return response
    })

  const api = <A>(
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    schema: Schema.Decoder<A>,
    write?: { readonly method: "PATCH" | "POST"; readonly body: unknown },
  ) =>
    request(token, path, query, write).pipe(
      Effect.flatMap((response) =>
        readJson(response, schema).pipe(Effect.map((body) => ({ body, response }))),
      ),
    )

  const page = <A>(
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    item: Schema.Decoder<A>,
  ) =>
    api(token, path, query, Schema.Array(item)).pipe(
      Effect.map(({ body, response }) => ({ items: body, total: totalCount(response) })),
    )

  /** Every item of a paginated list. */
  const all = <A>(
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    item: Schema.Decoder<A>,
  ) =>
    Effect.gen(function* () {
      const items: Array<A> = []
      let fullPage = 0
      for (let number = 1; number <= MAX_PAGES; number++) {
        const { items: batch, total } = yield* page(
          token,
          path,
          { ...query, limit: String(PAGE_SIZE), page: String(number) },
          item,
        )
        items.push(...batch)
        // Without a total, a short page is the last one. The longest page seen stands in for
        // the page size because MAX_RESPONSE_ITEMS can be below the limit Tabulo asks for.
        fullPage = Math.max(fullPage, batch.length)
        if (batch.length === 0) break
        if (total === undefined ? batch.length < fullPage : items.length >= total) break
      }
      return items as ReadonlyArray<A>
    })

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
      ).pipe(Effect.map(knownTotal)),
    unreadNotifications: (token, limit) =>
      page(token, "/notifications", { limit: String(limit) }, ForgejoNotification).pipe(
        Effect.map(knownTotal),
      ),
    userOrgs: (token) => all(token, "/user/orgs", {}, ForgejoOrg),
    orgRepos: (token, org) => all(token, `/orgs/${encodeURIComponent(org)}/repos`, {}, ForgejoRepo),
    // 204 for a member and 404 otherwise. Forgejo redirects a non-member asking about
    // themselves to the public_members check, which fetch follows and which also answers 404.
    isOrgMember: (token, org, login) =>
      request(
        token,
        `/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(login)}`,
        {},
      ).pipe(
        Effect.as(true),
        Effect.catchTag("ForgejoNotFound", () => Effect.succeed(false)),
      ),
    orgLabels: (token, org) =>
      all(token, `/orgs/${encodeURIComponent(org)}/labels`, {}, ForgejoLabel),
    repo: (token, repo) =>
      api(token, repoPath(repo), {}, ForgejoRepo).pipe(Effect.map(({ body }) => body)),
    repoIssues: (token, repo, listing) =>
      all(
        token,
        `${repoPath(repo)}/issues`,
        listing.state === "open"
          ? { type: "issues", state: "open" }
          : { type: "issues", state: "closed", since: listing.updatedSince },
        ForgejoRepoIssue,
      ),
    issue: (token, repo, number) =>
      api(token, `${repoPath(repo)}/issues/${number}`, {}, ForgejoRepoIssue).pipe(
        Effect.map(({ body }) => body),
      ),
    setIssueState: (token, repo, number, state) =>
      api(token, `${repoPath(repo)}/issues/${number}`, {}, ForgejoRepoIssue, {
        method: "PATCH",
        body: { state },
      }).pipe(Effect.map(({ body }) => body)),
    addIssueLabels: (token, repo, number, labelIds) =>
      api(token, `${repoPath(repo)}/issues/${number}/labels`, {}, Schema.Array(ForgejoLabel), {
        method: "POST",
        body: { labels: labelIds },
      }).pipe(Effect.map(({ body }) => body)),
    removeIssueLabel: (token, repo, number, labelId) =>
      request(
        token,
        `${repoPath(repo)}/issues/${number}/labels/${labelId}`,
        {},
        {
          method: "DELETE",
        },
      ).pipe(Effect.asVoid),
  }
}
