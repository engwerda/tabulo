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
  type ForgejoActionRun,
  ForgejoActionRunPage,
  ForgejoComment,
  ForgejoEpicIssue,
  ForgejoHeatmapEntry,
  ForgejoInsightIssue,
  ForgejoInsightRepo,
  ForgejoIssue,
  ForgejoIssueBody,
  ForgejoLabel,
  ForgejoLanguages,
  ForgejoMilestone,
  ForgejoNotification,
  ForgejoOrg,
  ForgejoPerson,
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

/**
 * Forgejo pages that one request may still read. The readers that share it run concurrently,
 * and each takes a page from it before reading the page. A route creates it outside
 * `withAccessToken`, so a retry after a token refresh reads from the same pool.
 */
export type PageBudget = { remaining: number }

// Workers allow 1,000 subrequests per request. Listing pages share this budget, which leaves
// room for the reads besides them: on each of at most two attempts, each of at most 20
// repositories reads itself (and, for Insights, its languages), and the session may refresh
// its token once.
export const PAGE_BUDGET = 800

/**
 * Shares `pool` between `readers` reads: each takes an equal share of the pages left when it
 * starts and gives back what it does not use.
 */
export const sharePages = (pool: PageBudget, readers: number) => {
  let left = readers
  return <A, E, R>(read: (budget: PageBudget) => Effect.Effect<A, E, R>) => {
    const budget: PageBudget = { remaining: 0 }
    return Effect.suspend(() => {
      budget.remaining = Math.floor(pool.remaining / left)
      pool.remaining -= budget.remaining
      left -= 1
      return read(budget)
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          pool.remaining += budget.remaining
        }),
      ),
    )
  }
}

/** A listing, and whether Tabulo read it to its end. */
export type Listing<A> = { readonly items: ReadonlyArray<A>; readonly complete: boolean }

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
    /** The instance's base URL, without a trailing slash. */
    readonly baseUrl: string
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
    /** Issues and pull requests of every repository the user can read whose text matches `q`. */
    readonly searchIssueText: (
      token: AccessToken,
      q: string,
      state: "open" | "closed",
      limit: number,
    ) => Effect.Effect<ReadonlyArray<ForgejoIssue>, ForgejoError>
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
    /** The labels, as far as `budget` reaches (100 pages by default). */
    readonly orgLabels: (
      token: AccessToken,
      org: string,
      budget?: PageBudget,
    ) => Effect.Effect<Listing<ForgejoLabel>, ForgejoError>
    readonly repo: (token: AccessToken, repo: RepoRef) => Effect.Effect<ForgejoRepo, ForgejoError>
    readonly repoIssues: (
      token: AccessToken,
      repo: RepoRef,
      listing: IssueListing,
    ) => Effect.Effect<ReadonlyArray<ForgejoRepoIssue>, ForgejoError>
    readonly repoEpicIssues: (
      token: AccessToken,
      repo: RepoRef,
      listing: IssueListing,
      budget: PageBudget,
    ) => Effect.Effect<Listing<ForgejoEpicIssue>, ForgejoError>
    readonly issue: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
    ) => Effect.Effect<ForgejoRepoIssue, ForgejoError>
    /** The issue's description as Markdown, empty when it has none. */
    readonly issueBody: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
    ) => Effect.Effect<string, ForgejoError>
    /** Every comment of the issue, oldest first. Forgejo does not page this list. */
    readonly issueComments: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
    ) => Effect.Effect<ReadonlyArray<ForgejoComment>, ForgejoError>
    readonly createComment: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
      body: string,
    ) => Effect.Effect<ForgejoComment, ForgejoError>
    /** The repository's own labels, without the organization's. */
    readonly repoLabels: (
      token: AccessToken,
      repo: RepoRef,
    ) => Effect.Effect<ReadonlyArray<ForgejoLabel>, ForgejoError>
    readonly openMilestones: (
      token: AccessToken,
      repo: RepoRef,
    ) => Effect.Effect<ReadonlyArray<ForgejoMilestone>, ForgejoError>
    /** The users Forgejo lets be assigned to the repository's issues. Not paged. */
    readonly repoAssignees: (
      token: AccessToken,
      repo: RepoRef,
    ) => Effect.Effect<ReadonlyArray<ForgejoPerson>, ForgejoError>
    /**
     * Creates an issue as the token's user. Forgejo drops `labelIds` without an error when
     * that user cannot write the repository's issues.
     */
    readonly createIssue: (
      token: AccessToken,
      repo: RepoRef,
      issue: { readonly title: string; readonly labelIds: ReadonlyArray<number> },
    ) => Effect.Effect<ForgejoRepoIssue, ForgejoError>
    /**
     * Replaces the issue's assignees with `logins`. Forgejo ignores the change without an
     * error when the token's user cannot write the repository's issues.
     */
    readonly setIssueAssignees: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
      logins: ReadonlyArray<string>,
    ) => Effect.Effect<ForgejoRepoIssue, ForgejoError>
    /**
     * Sets the issue's milestone, or clears it with null. Forgejo 17 refuses this with 403 when
     * the token's user cannot write the repository's issues.
     */
    readonly setIssueMilestone: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
      milestoneId: number | null,
    ) => Effect.Effect<ForgejoRepoIssue, ForgejoError>
    /** Renders an issue's Markdown as HTML, with relative links resolved in the repository. */
    readonly renderMarkdown: (
      token: AccessToken,
      repo: RepoRef,
      text: string,
    ) => Effect.Effect<string, ForgejoError>
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
    /**
     * Removes one label, named by `identifier`. Forgejo 15 and later look the identifier up as
     * a name among the repository's labels, then among the organization's, and only then as
     * the id of a repository label, so an organization label must go by name.
     */
    readonly removeIssueLabel: (
      token: AccessToken,
      repo: RepoRef,
      number: number,
      identifier: string,
    ) => Effect.Effect<void, ForgejoError>

    // Insights and activity reads.
    readonly insightRepo: (
      token: AccessToken,
      repo: RepoRef,
    ) => Effect.Effect<ForgejoInsightRepo, ForgejoError>
    /** Issues and pull requests together. */
    readonly repoIssuesAndPulls: (
      token: AccessToken,
      repo: RepoRef,
      listing: IssueListing,
      budget: PageBudget,
    ) => Effect.Effect<Listing<ForgejoInsightIssue>, ForgejoError>
    /**
     * Workflow runs created at or after `since` (epoch milliseconds), newest first. `null` when
     * the repository has no Actions data: Actions are turned off, or the user cannot see them.
     */
    readonly actionRuns: (
      token: AccessToken,
      repo: RepoRef,
      since: number,
      budget: PageBudget,
    ) => Effect.Effect<Listing<ForgejoActionRun> | null, ForgejoError>
    readonly repoLanguages: (
      token: AccessToken,
      repo: RepoRef,
    ) => Effect.Effect<ForgejoLanguages, ForgejoError>
    readonly openMilestonesListing: (
      token: AccessToken,
      repo: RepoRef,
      budget: PageBudget,
    ) => Effect.Effect<Listing<ForgejoMilestone>, ForgejoError>
    /** The user's contributions in 15-minute slots over about the last year. */
    readonly userHeatmap: (
      token: AccessToken,
      login: string,
    ) => Effect.Effect<ReadonlyArray<ForgejoHeatmapEntry>, ForgejoError>
  }
>()("tabulo/ForgejoClient") {}

const send = (fetch: HttpFetch, request: Request) =>
  Effect.tryPromise({
    try: () => fetch(request),
    catch: (cause) => new ForgejoUnreachable({ message: String(cause) }),
  })

const readText = (response: Response) =>
  Effect.tryPromise({
    try: () => response.text(),
    catch: () => new ForgejoDecodeFailed({ message: "response body is not text" }),
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

  /**
   * Reads pages from the first until the listing ends, `isLast` holds for a page, or the budget
   * runs out.
   */
  const paginate = <A>(
    budget: PageBudget,
    readPage: (
      number: number,
    ) => Effect.Effect<
      { readonly items: ReadonlyArray<A>; readonly total: number | undefined },
      ForgejoError
    >,
    isLast: (batch: ReadonlyArray<A>) => boolean = () => false,
  ) =>
    Effect.gen(function* () {
      const items: Array<A> = []
      let fullPage = 0
      for (let number = 1; budget.remaining > 0; number++) {
        budget.remaining -= 1
        const { items: batch, total } = yield* readPage(number)
        items.push(...batch)
        // Without a total, a short page is the last one. The longest page seen stands in for
        // the page size because MAX_RESPONSE_ITEMS can be below the limit Tabulo asks for.
        fullPage = Math.max(fullPage, batch.length)
        if (
          batch.length === 0 ||
          isLast(batch) ||
          (total === undefined ? batch.length < fullPage : items.length >= total)
        ) {
          return { items, complete: true } as Listing<A>
        }
      }
      return { items, complete: false } as Listing<A>
    })

  /** A paginated list, as far as the budget reaches. */
  const listing = <A>(
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    item: Schema.Decoder<A>,
    budget: PageBudget,
    isLast?: (batch: ReadonlyArray<A>) => boolean,
    pageSize = PAGE_SIZE,
  ) =>
    paginate(
      budget,
      (number) =>
        page(token, path, { ...query, limit: String(pageSize), page: String(number) }, item),
      isLast,
    )

  /** Every item of a paginated list up to MAX_PAGES pages, or its first `max`. */
  const all = <A>(
    token: AccessToken,
    path: string,
    query: Record<string, string>,
    item: Schema.Decoder<A>,
    max = Number.POSITIVE_INFINITY,
  ) => {
    let seen = 0
    return listing(
      token,
      path,
      query,
      item,
      { remaining: MAX_PAGES },
      (batch) => {
        seen += batch.length
        return seen >= max
      },
      Math.min(PAGE_SIZE, max),
    ).pipe(Effect.map(({ items }) => items.slice(0, max)))
  }

  const listRepoIssues = <A>(
    token: AccessToken,
    repo: RepoRef,
    issues: IssueListing,
    item: Schema.Decoder<A>,
    budget: PageBudget,
  ) =>
    listing(
      token,
      `${repoPath(repo)}/issues`,
      issues.state === "open"
        ? { type: "issues", state: "open" }
        : { type: "issues", state: "closed", since: issues.updatedSince },
      item,
      budget,
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
    baseUrl: config.baseUrl,
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
    searchIssueText: (token, q, state, limit) =>
      all(token, "/repos/issues/search", { q, state }, ForgejoIssue, limit),
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
    orgLabels: (token, org, budget = { remaining: MAX_PAGES }) =>
      listing(token, `/orgs/${encodeURIComponent(org)}/labels`, {}, ForgejoLabel, budget),
    repo: (token, repo) =>
      api(token, repoPath(repo), {}, ForgejoRepo).pipe(Effect.map(({ body }) => body)),
    repoIssues: (token, repo, issues) =>
      listRepoIssues(token, repo, issues, ForgejoRepoIssue, { remaining: MAX_PAGES }).pipe(
        Effect.map(({ items }) => items),
      ),
    repoEpicIssues: (token, repo, issues, budget) =>
      listRepoIssues(token, repo, issues, ForgejoEpicIssue, budget),
    issue: (token, repo, number) =>
      api(token, `${repoPath(repo)}/issues/${number}`, {}, ForgejoRepoIssue).pipe(
        Effect.map(({ body }) => body),
      ),
    issueBody: (token, repo, number) =>
      api(token, `${repoPath(repo)}/issues/${number}`, {}, ForgejoIssueBody).pipe(
        Effect.map(({ body }) => body.body),
      ),
    issueComments: (token, repo, number) =>
      api(
        token,
        `${repoPath(repo)}/issues/${number}/comments`,
        {},
        Schema.Array(ForgejoComment),
      ).pipe(Effect.map(({ body }) => body)),
    createComment: (token, repo, number, body) =>
      api(token, `${repoPath(repo)}/issues/${number}/comments`, {}, ForgejoComment, {
        method: "POST",
        body: { body },
      }).pipe(Effect.map(({ body }) => body)),
    repoLabels: (token, repo) => all(token, `${repoPath(repo)}/labels`, {}, ForgejoLabel),
    openMilestones: (token, repo) =>
      all(token, `${repoPath(repo)}/milestones`, { state: "open" }, ForgejoMilestone),
    repoAssignees: (token, repo) =>
      api(token, `${repoPath(repo)}/assignees`, {}, Schema.Array(ForgejoPerson)).pipe(
        Effect.map(({ body }) => body),
      ),
    createIssue: (token, repo, issue) =>
      api(token, `${repoPath(repo)}/issues`, {}, ForgejoRepoIssue, {
        method: "POST",
        body: {
          title: issue.title,
          ...(issue.labelIds.length === 0 ? {} : { labels: issue.labelIds }),
        },
      }).pipe(Effect.map(({ body }) => body)),
    setIssueAssignees: (token, repo, number, logins) =>
      api(token, `${repoPath(repo)}/issues/${number}`, {}, ForgejoRepoIssue, {
        method: "PATCH",
        body: { assignees: logins },
      }).pipe(Effect.map(({ body }) => body)),
    // EditIssueOption.milestone is the milestone id; 0 clears it.
    setIssueMilestone: (token, repo, number, milestoneId) =>
      api(token, `${repoPath(repo)}/issues/${number}`, {}, ForgejoRepoIssue, {
        method: "PATCH",
        body: { milestone: milestoneId ?? 0 },
      }).pipe(Effect.map(({ body }) => body)),
    // "comment" renders as Forgejo shows an issue description, with hard line breaks; "gfm"
    // renders a document, which joins the lines of a paragraph.
    renderMarkdown: (token, repo, text) =>
      request(
        token,
        "/markdown",
        {},
        {
          method: "POST",
          body: {
            Mode: "comment",
            Context: `${config.baseUrl}/${repo.owner}/${repo.name}`,
            Text: text,
          },
        },
      ).pipe(Effect.flatMap(readText)),
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
    removeIssueLabel: (token, repo, number, identifier) =>
      request(
        token,
        `${repoPath(repo)}/issues/${number}/labels/${encodeURIComponent(identifier)}`,
        {},
        { method: "DELETE" },
      ).pipe(Effect.asVoid),

    insightRepo: (token, repo) =>
      api(token, repoPath(repo), {}, ForgejoInsightRepo).pipe(Effect.map(({ body }) => body)),
    repoIssuesAndPulls: (token, repo, issues, budget) =>
      listing(
        token,
        `${repoPath(repo)}/issues`,
        issues.state === "open"
          ? { state: "open" }
          : { state: "closed", since: issues.updatedSince },
        ForgejoInsightIssue,
        budget,
      ),
    actionRuns: (token, repo, since, budget) =>
      paginate(
        budget,
        (number) =>
          api(
            token,
            `${repoPath(repo)}/actions/runs`,
            { limit: String(PAGE_SIZE), page: String(number) },
            ForgejoActionRunPage,
          ).pipe(
            Effect.map(({ body }) => ({ items: body.workflow_runs, total: body.total_count })),
          ),
        // Newest first: a run older than `since` means the later pages are older still.
        (batch) => batch.some((run) => Date.parse(run.created) < since),
      ).pipe(
        Effect.map(({ items, complete }): Listing<ForgejoActionRun> | null => ({
          items: items.filter((run) => Date.parse(run.created) >= since),
          complete,
        })),
        Effect.catchTag(["ForgejoNotFound", "ForgejoForbidden"], () => Effect.succeed(null)),
      ),
    repoLanguages: (token, repo) =>
      api(token, `${repoPath(repo)}/languages`, {}, ForgejoLanguages).pipe(
        Effect.map(({ body }) => body),
      ),
    openMilestonesListing: (token, repo, budget) =>
      listing(token, `${repoPath(repo)}/milestones`, { state: "open" }, ForgejoMilestone, budget),
    userHeatmap: (token, login) =>
      api(
        token,
        `/users/${encodeURIComponent(login)}/heatmap`,
        {},
        Schema.Array(ForgejoHeatmapEntry),
      ).pipe(Effect.map(({ body }) => body)),
  }
}
