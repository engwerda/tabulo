export const FORGEJO_URL = "https://forgejo.example"

export type RecordedRequest = {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly authorization: string | null
  readonly form: URLSearchParams
  /** The parsed body of a JSON request, otherwise undefined. */
  readonly json: unknown
}

export type SearchFilter = "review_requested" | "assigned" | "mentioned" | "created"

export type FakeUser = { id: number; login: string; full_name: string; avatar_url: string }

/** A label as Forgejo 17 returns it. */
export type FakeLabel = {
  id: number
  name: string
  color: string
  exclusive: boolean
  description: string
  url: string
  is_archived: boolean
}

/** An issue or pull request as Forgejo 17 returns it from the repository endpoints. */
export type FakeIssue = {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  state: "open" | "closed"
  labels: Array<FakeLabel>
  user: { id: number; login: string; avatar_url: string }
  assignees: Array<{ id: number; login: string; full_name: string; avatar_url: string }> | null
  milestone: { id: number; title: string; state: string } | null
  created_at: string
  updated_at: string
  closed_at: string | null
  comments: number
  pull_request: {
    merged: boolean
    merged_at?: string | null
    draft: boolean
    html_url: string
  } | null
  repository: { id: number; name: string; owner: string; full_name: string }
  [field: string]: unknown
}

export type FakeRepo = {
  name: string
  private: boolean
  archived: boolean
  /** Logins with push access, which includes writing issues. */
  writers: ReadonlyArray<string>
  /** Logins who may write issues without push access, as a triage team can. */
  triagers: ReadonlyArray<string>
  /** Repository-level labels, beside the organization's. */
  labels: ReadonlyArray<FakeLabel>
  issues: Array<FakeIssue>
  /** Issue listings answer HTTP 500. */
  failIssueListing: boolean
  // Insights reads.
  updated_at?: string
  default_branch?: string
  /** Workflow runs, newest first. Without them `/actions/runs` answers 404, as with Actions off. */
  actionRuns?: ReadonlyArray<FakeActionRun>
  languages?: Record<string, number>
  milestones?: ReadonlyArray<FakeMilestone>
}

/** A workflow run as Forgejo 17 lists it, without the large `event_payload` and `repository`. */
export type FakeActionRun = {
  id: number
  title: string
  status: string
  workflow_id: string
  index_in_repo: number
  prettyref: string
  event: string
  html_url: string
  created: string
  updated: string
  started: string
  stopped: string
  duration: number
}

export type FakeMilestone = {
  id: number
  title: string
  description: string
  state: "open" | "closed"
  open_issues: number
  closed_issues: number
  created_at: string
  updated_at: string
  closed_at: string | null
  due_on: string | null
}

export type FakeOrg = {
  name: string
  full_name: string
  avatar_url: string
  members: ReadonlyArray<string>
  labels: ReadonlyArray<FakeLabel>
  repos: Array<FakeRepo>
}

export type FakeForgejoFixtures = {
  /** Signs in when `approve` names no other login. */
  readonly user: FakeUser
  /** More users who can sign in, by passing their login to `approve`. */
  readonly otherUsers: ReadonlyArray<FakeUser>
  readonly orgs: ReadonlyArray<FakeOrg>
  /** `read` makes every write answer 403, as Forgejo does for a token without write:issue. */
  readonly tokenScope: "read" | "write"
  /** Forgejo's MAX_RESPONSE_ITEMS: the largest page any list endpoint returns. */
  readonly maxPageSize: number
  /** Leaves out X-Total-Count, as a proxy that strips headers would. */
  readonly omitTotalCount: boolean
  /** The time Forgejo stamps on issues it changes. */
  readonly now: string
  readonly issues: Partial<Record<SearchFilter, ReadonlyArray<unknown>>>
  readonly totals: Partial<Record<SearchFilter, number>>
  readonly notifications: ReadonlyArray<unknown>
  readonly failingSearches: ReadonlyArray<SearchFilter>
  readonly expiresIn: number
  /** Answers every refresh grant with this response instead of the normal outcome. */
  readonly refreshFailure: { readonly status: number; readonly body: string } | undefined
  /** Awaited before a refresh response is sent, so a test can order concurrent refreshes. */
  readonly beforeRefreshResponse: (outcome: "issued" | "rejected") => Promise<void>
  /**
   * Runs before each authenticated API request. A response answers the request instead of
   * the fake, so a test can fail one step or change data between Tabulo's read and write.
   */
  readonly intercept: (method: string, path: string) => Response | undefined
  /** The signed-in user's contribution heatmap, in 15-minute slots. */
  readonly heatmap: ReadonlyArray<{ readonly timestamp: number; readonly contributions: number }>
}

/** Forgejo's Label.ExclusiveScope: the name up to its last `/`, for exclusive labels only. */
const exclusiveScope = (label: FakeLabel) => {
  const slash = label.name.lastIndexOf("/")
  return label.exclusive && slash > 0 && slash < label.name.length - 1
    ? label.name.slice(0, slash)
    : ""
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })

const sha256Base64Url = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

/**
 * An in-memory Forgejo that implements the OAuth2 token endpoint (with PKCE
 * verification), the API endpoints Tabulo reads, and the issue writes the board sends.
 */
export const createFakeForgejo = (overrides: Partial<FakeForgejoFixtures> = {}) => {
  const fixtures: FakeForgejoFixtures = {
    user: {
      id: 7,
      login: "ada",
      full_name: "Ada Lovelace",
      avatar_url: `${FORGEJO_URL}/avatars/ada`,
    },
    issues: {},
    totals: {},
    notifications: [],
    failingSearches: [],
    expiresIn: 3600,
    refreshFailure: undefined,
    beforeRefreshResponse: () => Promise.resolve(),
    intercept: () => undefined,
    otherUsers: [],
    orgs: [],
    tokenScope: "write",
    maxPageSize: 50,
    omitTotalCount: false,
    now: "2026-11-07T09:00:00Z",
    heatmap: [],
    ...overrides,
  }
  const users = [fixtures.user, ...fixtures.otherUsers]
  const orgs = structuredClone(fixtures.orgs) as Array<FakeOrg>
  const requests: Array<RecordedRequest> = []
  const authorizationCodes = new Map<string, { challenge: string; login: string }>()
  /** Token to the login it was issued for. */
  const validAccessTokens = new Map<string, string>()
  const validRefreshTokens = new Map<string, string>()
  let issued = 0

  const issueTokens = (login: string) => {
    issued += 1
    const access = `access-${issued}`
    const refresh = `refresh-${issued}`
    validAccessTokens.set(access, login)
    validRefreshTokens.set(refresh, login)
    return json({
      access_token: access,
      refresh_token: refresh,
      token_type: "bearer",
      expires_in: fixtures.expiresIn,
    })
  }

  const tokenEndpoint = (form: URLSearchParams) => {
    if (
      form.get("client_id") !== "test-client-id" ||
      form.get("client_secret") !== "test-client-secret"
    ) {
      return json({ error: "invalid_client" }, { status: 400 })
    }
    if (form.get("grant_type") === "authorization_code") {
      const code = form.get("code") ?? ""
      const approval = authorizationCodes.get(code)
      authorizationCodes.delete(code)
      return sha256Base64Url(form.get("code_verifier") ?? "").then((computed) =>
        approval !== undefined &&
        computed === approval.challenge &&
        form.get("redirect_uri") === "https://tabulo.example/auth/callback"
          ? issueTokens(approval.login)
          : json({ error: "invalid_grant" }, { status: 400 }),
      )
    }
    if (form.get("grant_type") === "refresh_token") {
      if (fixtures.refreshFailure !== undefined) {
        return new Response(fixtures.refreshFailure.body, {
          status: fixtures.refreshFailure.status,
        })
      }
      const refresh = form.get("refresh_token") ?? ""
      const login = validRefreshTokens.get(refresh)
      if (login === undefined) {
        const rejection = json(
          { error: "unauthorized_client", error_description: "token was already used" },
          { status: 400 },
        )
        return fixtures.beforeRefreshResponse("rejected").then(() => rejection)
      }
      // Rotation, as with Forgejo's INVALIDATE_REFRESH_TOKENS: each refresh token works once.
      validRefreshTokens.delete(refresh)
      validAccessTokens.delete(refresh.replace("refresh-", "access-"))
      const issued = issueTokens(login)
      return fixtures.beforeRefreshResponse("issued").then(() => issued)
    }
    return json({ error: "unsupported_grant_type" }, { status: 400 })
  }

  /** One page of `items`, with Forgejo's paging parameters, limit cap, and total header. */
  const paged = (items: ReadonlyArray<unknown>, query: URLSearchParams) => {
    const limit = Math.min(Number(query.get("limit") ?? 30) || 30, fixtures.maxPageSize)
    const page = Math.max(Number(query.get("page") ?? 1) || 1, 1)
    return json(items.slice((page - 1) * limit, page * limit), {
      headers: fixtures.omitTotalCount ? {} : { "x-total-count": String(items.length) },
    })
  }

  const notFound = () => json({ message: "not found" }, { status: 404 })
  const forbidden = () => json({ message: "permission denied" }, { status: 403 })

  // Forgejo matches owner and repository names case-insensitively.
  const findOrg = (name: string) =>
    orgs.find((org) => org.name.toLowerCase() === name.toLowerCase())
  const findRepo = (owner: string, name: string) =>
    findOrg(owner)?.repos.find((repo) => repo.name.toLowerCase() === name.toLowerCase())

  const repoJson = (owner: string, repo: FakeRepo, login: string) => ({
    id: 100,
    name: repo.name,
    full_name: `${owner}/${repo.name}`,
    owner: { id: 1, login: owner },
    private: repo.private,
    archived: repo.archived,
    html_url: `${FORGEJO_URL}/${owner}/${repo.name}`,
    default_branch: repo.default_branch ?? "main",
    updated_at: repo.updated_at ?? fixtures.now,
    // Forgejo derives push from the code unit; issue-unit write is not exposed here.
    permissions: { admin: false, push: repo.writers.includes(login), pull: true },
  })

  // CanWriteIssuesOrPulls: the issue unit's write access, which triage members have too.
  const canWriteIssues = (repo: FakeRepo, login: string) =>
    fixtures.tokenScope === "write" &&
    (repo.writers.includes(login) || repo.triagers.includes(login))

  const archivedRefusal = () => json({ message: "repo is archived" }, { status: 423 })

  const listIssues = (repo: FakeRepo, query: URLSearchParams) => {
    if (repo.failIssueListing) return json({ message: "internal error" }, { status: 500 })
    const state = query.get("state") ?? "open"
    const type = query.get("type")
    const since = query.get("since")
    const matches = repo.issues.filter(
      (issue) =>
        (state === "all" || issue.state === state) &&
        (type !== "issues" || issue.pull_request === null) &&
        (type !== "pulls" || issue.pull_request !== null) &&
        (since === null || Date.parse(issue.updated_at) >= Date.parse(since)),
    )
    return paged(matches, query)
  }

  const editIssue = (repo: FakeRepo, issue: FakeIssue, login: string, body: unknown) => {
    if (repo.archived) return archivedRefusal()
    const isPoster = fixtures.tokenScope === "write" && issue.user.login === login
    if (!canWriteIssues(repo, login) && !isPoster) return forbidden()
    const { state } = body as { state?: "open" | "closed" }
    if (state !== undefined && state !== issue.state) {
      issue.state = state
      issue.closed_at = state === "closed" ? fixtures.now : null
    }
    issue.updated_at = fixtures.now
    return json(issue, { status: 201 })
  }

  /**
   * Forgejo's issue label endpoints. POST adds labels and PUT replaces the set; every label
   * either adds removes the issue's other labels in its exclusive scope, repository-level and
   * organization-level alike (RemoveDuplicateExclusiveIssueLabels). DELETE removes one label.
   * Unknown ids in a POST or PUT are ignored, as in Forgejo.
   */
  const issueLabels = (
    method: string,
    org: FakeOrg,
    repo: FakeRepo,
    issue: FakeIssue,
    login: string,
    labelId: string | undefined,
    body: unknown,
  ) => {
    if (method === "GET") return json(issue.labels)
    if (repo.archived) return archivedRefusal()
    if (!canWriteIssues(repo, login)) return forbidden()
    const available = [...org.labels, ...repo.labels]
    if (method === "DELETE" && labelId !== undefined) {
      if (!available.some((label) => label.id === Number(labelId))) {
        return json({ message: "label does not exist" }, { status: 422 })
      }
      issue.labels = issue.labels.filter((label) => label.id !== Number(labelId))
      issue.updated_at = fixtures.now
      return new Response(null, { status: 204 })
    }
    if (labelId !== undefined || (method !== "POST" && method !== "PUT")) {
      return json({ message: "method not allowed" }, { status: 405 })
    }
    const ids = (body as { labels: ReadonlyArray<number> }).labels
    if (method === "PUT") issue.labels = []
    for (const label of available.filter((candidate) => ids.includes(candidate.id))) {
      if (issue.labels.some((present) => present.id === label.id)) continue
      const scope = exclusiveScope(label)
      issue.labels = [
        ...issue.labels.filter((present) => scope === "" || exclusiveScope(present) !== scope),
        label,
      ]
    }
    issue.updated_at = fixtures.now
    return json(issue.labels)
  }

  /** The reads only the insights page and the activity calendar make. */
  const insightsApi = (path: string, query: URLSearchParams, login: string) => {
    const heatmapPath = /^\/api\/v1\/users\/([^/]+)\/heatmap$/.exec(path)
    if (heatmapPath !== null) return heatmapPath[1] === login ? json(fixtures.heatmap) : json([])
    const repoRead =
      /^\/api\/v1\/repos\/([^/]+)\/([^/]+)\/(actions\/runs|languages|milestones)$/.exec(path)
    if (repoRead === null) return undefined
    const [, owner = "", name = "", what] = repoRead
    const repo = findRepo(owner, name)
    if (repo === undefined) return notFound()
    if (what === "languages") return json(repo.languages ?? {})
    if (what === "milestones") {
      const state = query.get("state") ?? "open"
      return paged(
        (repo.milestones ?? []).filter((milestone) => state === "all" || milestone.state === state),
        query,
      )
    }
    if (repo.actionRuns === undefined) return notFound()
    const limit = Math.min(Number(query.get("limit") ?? 30) || 30, fixtures.maxPageSize)
    const page = Math.max(Number(query.get("page") ?? 1) || 1, 1)
    return json({
      workflow_runs: repo.actionRuns.slice((page - 1) * limit, page * limit),
      total_count: repo.actionRuns.length,
    })
  }

  const api = (
    method: string,
    path: string,
    query: URLSearchParams,
    login: string,
    body: unknown,
  ) => {
    const user = users.find((candidate) => candidate.login === login)
    if (path === "/api/v1/user") return json(user)
    if (path === "/api/v1/user/orgs") {
      return paged(
        orgs
          .filter((org) => org.members.includes(login))
          .map((org) => ({
            id: 1,
            name: org.name,
            username: org.name,
            full_name: org.full_name,
            avatar_url: org.avatar_url,
            visibility: "private",
          })),
        query,
      )
    }
    if (path === "/api/v1/notifications") {
      return json(fixtures.notifications, {
        headers: { "x-total-count": String(fixtures.notifications.length) },
      })
    }
    if (path === "/api/v1/repos/issues/search" && query.has("q")) {
      const text = (query.get("q") ?? "").toLowerCase()
      const state = query.get("state") ?? "all"
      const seen = new Set<string>()
      const matches = Object.values(fixtures.issues)
        .flatMap(
          (items) =>
            (items ?? []) as ReadonlyArray<{ title: string; state: string; html_url: string }>,
        )
        .filter((issue) => !seen.has(issue.html_url) && seen.add(issue.html_url))
        .filter((issue) => issue.title.toLowerCase().includes(text))
        .filter((issue) => state === "all" || issue.state === state)
      return paged(matches, query)
    }
    if (path === "/api/v1/repos/issues/search") {
      const filter = (["review_requested", "assigned", "mentioned", "created"] as const).find(
        (name) => query.get(name) === "true",
      )
      if (filter === undefined) return json({ message: "no filter" }, { status: 422 })
      if (fixtures.failingSearches.includes(filter)) {
        return json({ message: "internal error" }, { status: 500 })
      }
      const items = fixtures.issues[filter] ?? []
      return json(items, {
        headers: { "x-total-count": String(fixtures.totals[filter] ?? items.length) },
      })
    }
    // Forgejo redirects a non-member to the public_members check, which answers 404 unless
    // the membership is public; Tabulo only ever asks about the signed-in user.
    const memberPath = /^\/api\/v1\/orgs\/([^/]+)\/members\/([^/]+)$/.exec(path)
    if (memberPath !== null) {
      const [, orgName = "", member = ""] = memberPath
      const org = findOrg(orgName)
      if (org === undefined) return notFound()
      return org.members.includes(member) && org.members.includes(login)
        ? new Response(null, { status: 204 })
        : notFound()
    }
    const orgPath = /^\/api\/v1\/orgs\/([^/]+)\/(repos|labels)$/.exec(path)
    if (orgPath !== null) {
      const [, orgName = "", what] = orgPath
      const org = findOrg(orgName)
      if (org === undefined) return notFound()
      return what === "labels"
        ? paged(org.labels, query)
        : paged(
            org.repos.map((repo) => repoJson(org.name, repo, login)),
            query,
          )
    }
    const insightsResponse = insightsApi(path, query, login)
    if (insightsResponse !== undefined) return insightsResponse
    const repoPath =
      /^\/api\/v1\/repos\/([^/]+)\/([^/]+)(?:\/issues(?:\/(\d+)(\/labels(?:\/(\d+))?)?)?)?$/.exec(
        path,
      )
    if (repoPath !== null) {
      const [, owner = "", name = "", number, labels, labelId] = repoPath
      const org = findOrg(owner)
      const repo = findRepo(owner, name)
      if (org === undefined || repo === undefined) return notFound()
      if (!path.includes("/issues")) return json(repoJson(owner, repo, login))
      if (number === undefined) return listIssues(repo, query)
      const issue = repo.issues.find((candidate) => candidate.number === Number(number))
      if (issue === undefined) return notFound()
      if (labels !== undefined) {
        return issueLabels(method, org, repo, issue, login, labelId, body)
      }
      return method === "PATCH" ? editIssue(repo, issue, login, body) : json(issue)
    }
    return notFound()
  }

  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.origin !== FORGEJO_URL) throw new Error(`unexpected outbound request to ${url.origin}`)
    const body = request.method === "GET" || request.method === "DELETE" ? "" : await request.text()
    const isJson = request.headers.get("content-type")?.includes("application/json") === true
    const parsed: unknown = isJson ? JSON.parse(body) : undefined
    const form = isJson
      ? new URLSearchParams(
          Object.entries(parsed as object).map(([key, value]) => [key, String(value)]),
        )
      : new URLSearchParams(body)
    const authorization = request.headers.get("authorization")
    requests.push({
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      authorization,
      form,
      json: parsed,
    })
    if (url.pathname === "/login/oauth/access_token" && request.method === "POST") {
      return tokenEndpoint(form)
    }
    const token = authorization?.replace(/^Bearer /, "") ?? ""
    const login = validAccessTokens.get(token)
    if (login === undefined) return json({ message: "unauthorized" }, { status: 401 })
    const intercepted = fixtures.intercept(request.method, url.pathname)
    if (intercepted !== undefined) return intercepted
    return api(request.method, url.pathname, url.searchParams, login, parsed)
  }

  return {
    fetch,
    requests,
    /** Simulates a user, by default `fixtures.user`, approving the app on Forgejo's authorize page. */
    approve: (codeChallenge: string, login: string = fixtures.user.login) => {
      const code = `code-${authorizationCodes.size + 1}`
      authorizationCodes.set(code, { challenge: codeChallenge, login })
      return code
    },
    /** The current state of an issue, after any writes. */
    issue: (owner: string, repo: string, number: number) =>
      findRepo(owner, repo)?.issues.find((issue) => issue.number === number),
    revokeAccessTokens: () => validAccessTokens.clear(),
  }
}
