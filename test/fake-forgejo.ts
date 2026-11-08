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

/** An issue comment as Forgejo 17 returns it. */
export type FakeComment = {
  id: number
  html_url: string
  issue_url: string
  user: FakeUser
  body: string
  created_at: string
  updated_at: string
}

/** An issue or pull request as Forgejo 17 returns it from the repository endpoints. */
export type FakeIssue = {
  id: number
  number: number
  title: string
  html_url: string
  state: "open" | "closed"
  labels: Array<FakeLabel>
  /** Forgejo always sends the poster's avatar; the fake derives one when it is left out. */
  user: { id: number; login: string; avatar_url?: string }
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
  /** The description as Markdown. Empty when left out or null. */
  body?: string | null
  /**
   * The issue's comments, oldest first, which the fake serves from the comments endpoints and
   * leaves out of the issue itself. The fake sets `comments` to their number. Left out, the
   * fake makes up `comments` comments by the poster, so the count and the list agree.
   */
  commentRecords?: Array<FakeComment>
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
  /** Open and closed milestones. None when left out. */
  milestones?: ReadonlyArray<FakeMilestone>
  issues: Array<FakeIssue>
  /** Issue listings answer HTTP 500. */
  failIssueListing: boolean
  // Insights reads.
  updated_at?: string
  default_branch?: string
  /** Workflow runs, newest first. Without them `/actions/runs` answers 404, as with Actions off. */
  actionRuns?: ReadonlyArray<FakeActionRun>
  languages?: Record<string, number>
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

/** A milestone as Forgejo 17 returns it. */
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
  const issueComments = new Map<FakeIssue, Array<FakeComment>>()
  let lastCommentId = Math.max(
    0,
    ...orgs.flatMap((org) =>
      org.repos.flatMap((repo) =>
        repo.issues.flatMap((issue) => (issue.commentRecords ?? []).map((comment) => comment.id)),
      ),
    ),
  )
  const commentJson = (issue: FakeIssue, poster: FakeUser, body: string, at: string) => {
    lastCommentId += 1
    return {
      id: lastCommentId,
      html_url: `${issue.html_url}#issuecomment-${lastCommentId}`,
      issue_url: issue.html_url,
      user: poster,
      body,
      created_at: at,
      updated_at: at,
    }
  }
  for (const issue of orgs.flatMap((org) => org.repos.flatMap((repo) => repo.issues))) {
    issue.user.avatar_url ??= `${FORGEJO_URL}/avatars/${issue.user.login}`
    issue.body ??= ""
    const poster = users.find((user) => user.login === issue.user.login) ?? {
      id: issue.user.id,
      login: issue.user.login,
      full_name: "",
      avatar_url: issue.user.avatar_url,
    }
    const comments =
      issue.commentRecords ??
      Array.from({ length: issue.comments }, (_, index) =>
        commentJson(issue, poster, `Comment ${index + 1} on #${issue.number}.`, issue.created_at),
      )
    delete issue.commentRecords
    issue.comments = comments.length
    issueComments.set(issue, comments)
  }
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

  /**
   * GetRepoAssignees: users with write access and members of teams that write issues or read
   * pull requests. The fake's writers and triagers stand for both; organization membership
   * alone does not make a user assignable.
   */
  const isAssignable = (repo: FakeRepo, user: FakeUser) =>
    repo.writers.includes(user.login) || repo.triagers.includes(user.login)

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

  const userJson = (user: FakeUser) => ({
    id: user.id,
    login: user.login,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
  })

  /**
   * Forgejo 17's EditIssue. For a user who cannot write the repository's issues, Forgejo drops
   * `assignees` without an error (hackEditIssue), refuses `milestone`, and refuses `state`
   * unless the user posted the issue (ReqEditIssue). `assignees` replaces the assignees; a
   * login that does not exist or cannot be assigned (no issue write access) fails the request
   * with HTTP 500, as UpdateAssignees does. `milestone: 0` clears the milestone, and an id the
   * repository does not have fails with HTTP 500, as ChangeMilestoneAssign does.
   */
  const editIssue = (repo: FakeRepo, issue: FakeIssue, login: string, body: unknown) => {
    if (repo.archived) return archivedRefusal()
    if (fixtures.tokenScope !== "write") return forbidden()
    const canWrite = canWriteIssues(repo, login)
    const { state, assignees, milestone } = body as {
      state?: "open" | "closed"
      assignees?: ReadonlyArray<string>
      milestone?: number
    }
    if (
      !canWrite &&
      (milestone !== undefined || (state !== undefined && issue.user.login !== login))
    ) {
      return forbidden()
    }
    if (assignees !== undefined && canWrite) {
      const assigned = assignees.map((name) =>
        users.find(
          (user) => user.login.toLowerCase() === name.toLowerCase() && isAssignable(repo, user),
        ),
      )
      if (assigned.some((user) => user === undefined)) {
        return json({ message: "user cannot be assigned" }, { status: 500 })
      }
      issue.assignees = assigned.flatMap((user) => (user === undefined ? [] : [userJson(user)]))
    }
    if (milestone !== undefined) {
      const chosen = (repo.milestones ?? []).find((candidate) => candidate.id === milestone)
      if (milestone !== 0 && chosen === undefined) {
        return json({ message: "milestone does not exist" }, { status: 500 })
      }
      issue.milestone =
        chosen === undefined ? null : { id: chosen.id, title: chosen.title, state: chosen.state }
    }
    if (state !== undefined && state !== issue.state) {
      issue.state = state
      issue.closed_at = state === "closed" ? fixtures.now : null
    }
    issue.updated_at = fixtures.now
    return json(issue, { status: 201 })
  }

  /**
   * Forgejo's CreateIssue. Anyone who can read the repository may create an issue, but Forgejo
   * keeps `labels` only for a user who can write its issues and drops them otherwise. Label ids
   * of other organizations or repositories are ignored. Issues and pull requests share numbers.
   */
  const createIssue = (
    owner: string,
    org: FakeOrg,
    repo: FakeRepo,
    login: string,
    body: unknown,
  ) => {
    if (repo.archived) return archivedRefusal()
    if (fixtures.tokenScope !== "write") return forbidden()
    const {
      title,
      body: text,
      labels,
    } = body as {
      title?: string
      body?: string
      labels?: ReadonlyArray<number>
    }
    if (title === undefined || title.trim() === "") {
      return json({ message: "title is required" }, { status: 422 })
    }
    const poster = users.find((user) => user.login === login)
    if (poster === undefined) return forbidden()
    const allIssues = orgs.flatMap((candidate) => candidate.repos.flatMap((r) => r.issues))
    const number = Math.max(0, ...repo.issues.map((issue) => issue.number)) + 1
    const issue: FakeIssue = {
      id: Math.max(0, ...allIssues.map((candidate) => candidate.id)) + 1,
      number,
      title,
      html_url: `${FORGEJO_URL}/${owner}/${repo.name}/issues/${number}`,
      state: "open",
      labels: [],
      user: { id: poster.id, login: poster.login, avatar_url: poster.avatar_url },
      assignees: null,
      milestone: null,
      created_at: fixtures.now,
      updated_at: fixtures.now,
      closed_at: null,
      comments: 0,
      pull_request: null,
      repository: { id: 100, name: repo.name, owner, full_name: `${owner}/${repo.name}` },
      body: text ?? "",
    }
    if (canWriteIssues(repo, login)) {
      for (const label of [...org.labels, ...repo.labels]) {
        if (!(labels ?? []).includes(label.id)) continue
        const scope = exclusiveScope(label)
        issue.labels = [
          ...issue.labels.filter((present) => scope === "" || exclusiveScope(present) !== scope),
          label,
        ]
      }
    }
    repo.issues.push(issue)
    return json(issue, { status: 201 })
  }

  const commentsOf = (issue: FakeIssue) => {
    const comments = issueComments.get(issue) ?? []
    issueComments.set(issue, comments)
    return comments
  }

  /**
   * Forgejo's issue comment endpoints. GET lists every comment, oldest first, without paging.
   * POST comments as the user: anyone who can read the repository may, unless the issue is
   * locked and the user cannot write its issues. An empty body fails validation with 422.
   */
  const issueCommentsEndpoint = (
    method: string,
    repo: FakeRepo,
    issue: FakeIssue,
    login: string,
    body: unknown,
  ) => {
    const comments = commentsOf(issue)
    if (method === "GET") {
      return json(comments, { headers: { "x-total-count": String(comments.length) } })
    }
    if (method !== "POST") return json({ message: "method not allowed" }, { status: 405 })
    if (repo.archived) return archivedRefusal()
    if (fixtures.tokenScope !== "write") return forbidden()
    if (issue.is_locked === true && !canWriteIssues(repo, login)) return forbidden()
    const { body: text } = body as { body?: string }
    if (text === undefined || text === "") {
      return json({ message: "body is required" }, { status: 422 })
    }
    const poster = users.find((user) => user.login === login)
    if (poster === undefined) return forbidden()
    const comment = commentJson(issue, userJson(poster), text, fixtures.now)
    comments.push(comment)
    issue.comments = comments.length
    issue.updated_at = fixtures.now
    return json(comment, { status: 201 })
  }

  const escapeHtml = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&#34;")

  /**
   * Forgejo's POST /markdown, with a stand-in renderer: each blank-line separated paragraph
   * becomes a `<p>`, and in comment mode a line break becomes `<br>`. Empty text renders as
   * an empty body, as in Forgejo.
   */
  const renderMarkdown = (body: unknown) => {
    const { Text: text = "", Mode: mode } = body as { Text?: string; Mode?: string }
    const html = text
      .split(/\n{2,}/)
      .filter((paragraph) => paragraph.trim() !== "")
      .map(
        (paragraph) =>
          `<p>${escapeHtml(paragraph.trim()).replaceAll("\n", mode === "comment" ? "<br>\n" : "\n")}</p>`,
      )
      .join("\n")
    return new Response(html, { headers: { "content-type": "text/html; charset=UTF-8" } })
  }

  /**
   * Forgejo 15+'s DeleteIssueLabel lookup: the identifier as a name among the repository's
   * labels, then among the organization's, then as the id of a repository label. An
   * organization label's id finds nothing.
   */
  const labelByIdentifier = (org: FakeOrg, repo: FakeRepo, identifier: string) =>
    repo.labels.find((label) => label.name === identifier) ??
    org.labels.find((label) => label.name === identifier) ??
    (/^-?\d+$/.test(identifier)
      ? repo.labels.find((label) => label.id === Number(identifier))
      : undefined)

  /**
   * Forgejo's issue label endpoints. POST adds labels and PUT replaces the set; every label
   * either adds removes the issue's other labels in its exclusive scope, repository-level and
   * organization-level alike (RemoveDuplicateExclusiveIssueLabels). Unknown ids in a POST or
   * PUT are ignored, as in Forgejo. DELETE removes one label, found by `labelByIdentifier`,
   * and succeeds when the issue does not have it.
   */
  const issueLabels = (
    method: string,
    org: FakeOrg,
    repo: FakeRepo,
    issue: FakeIssue,
    login: string,
    identifier: string | undefined,
    body: unknown,
  ) => {
    if (method === "GET") return json(issue.labels)
    if (repo.archived) return archivedRefusal()
    if (!canWriteIssues(repo, login)) return forbidden()
    if (method === "DELETE" && identifier !== undefined) {
      const removed = labelByIdentifier(org, repo, identifier)
      if (removed === undefined) return json({ message: "label does not exist" }, { status: 422 })
      issue.labels = issue.labels.filter((label) => label.id !== removed.id)
      issue.updated_at = fixtures.now
      return new Response(null, { status: 204 })
    }
    const available = [...org.labels, ...repo.labels]
    if (identifier !== undefined || (method !== "POST" && method !== "PUT")) {
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
    const repoRead = /^\/api\/v1\/repos\/([^/]+)\/([^/]+)\/(actions\/runs|languages)$/.exec(path)
    if (repoRead === null) return undefined
    const [, owner = "", name = "", what] = repoRead
    const repo = findRepo(owner, name)
    if (repo === undefined) return notFound()
    if (what === "languages") return json(repo.languages ?? {})
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
    if (path === "/api/v1/markdown" && method === "POST") return renderMarkdown(body)
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
    const repoPath = /^\/api\/v1\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(path)
    if (repoPath !== null) {
      const [, owner = "", name = "", rest = ""] = repoPath
      const org = findOrg(owner)
      const repo = findRepo(owner, name)
      if (org === undefined || repo === undefined) return notFound()
      if (rest === "") return json(repoJson(owner, repo, login))
      if (rest === "/labels") return paged(repo.labels, query)
      if (rest === "/milestones") {
        const state = query.get("state") ?? "open"
        return paged(
          (repo.milestones ?? []).filter(
            (milestone) => state === "all" || milestone.state === state,
          ),
          query,
        )
      }
      if (rest === "/assignees") {
        return json(
          users
            .filter((candidate) => isAssignable(repo, candidate))
            .sort((a, b) => a.login.localeCompare(b.login))
            .map(userJson),
        )
      }
      if (rest === "/issues") {
        return method === "POST"
          ? createIssue(owner, org, repo, login, body)
          : listIssues(repo, query)
      }
      const issuePath = /^\/issues\/(\d+)(?:\/(labels|comments)(?:\/([^/]+))?)?$/.exec(rest)
      if (issuePath === null) return notFound()
      const [, number = "", sub, identifier] = issuePath
      const issue = repo.issues.find((candidate) => candidate.number === Number(number))
      if (issue === undefined) return notFound()
      if (sub === "labels") {
        return issueLabels(
          method,
          org,
          repo,
          issue,
          login,
          identifier === undefined ? undefined : decodeURIComponent(identifier),
          body,
        )
      }
      if (sub === "comments") {
        return identifier === undefined
          ? issueCommentsEndpoint(method, repo, issue, login, body)
          : notFound()
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
