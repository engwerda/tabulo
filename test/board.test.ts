import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo } from "./fake-forgejo.ts"
import {
  acme,
  ada,
  backlog,
  boardIssue,
  boardRepo,
  bug,
  grace,
  highPriority,
  inProgress,
  issueComment,
  label,
  milestone,
  outsider,
  repoLabel,
  retired,
  review,
} from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

type Card = {
  key: string
  column: string
  rank: string
  labels: Array<{ name: string }>
  readOnlyReason: string | null
}
type BoardBody = {
  viewerCanArrange: boolean
  columns: Array<{ key: string }>
  cards: Array<Card>
  failedRepos: Array<unknown>
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
    env.DB.prepare("DELETE FROM card_ranks"),
  ])
})

const boardOrg = () =>
  acme([
    boardRepo("api", {
      issues: [
        boardIssue("api", 1, { title: "Plain open issue" }),
        boardIssue("api", 2, {
          title: "Retry failed webhooks",
          labels: [inProgress, bug],
          assignees: [{ id: 7, login: "ada", full_name: "Ada Lovelace", avatar_url: "" }],
          comments: 4,
          updated_at: "2026-11-06T10:00:00Z",
        }),
        boardIssue("api", 3, {
          title: "Closed three days ago",
          state: "closed",
          labels: [review],
          closed_at: "2026-11-04T09:00:00Z",
          updated_at: "2026-11-04T09:00:00Z",
        }),
        boardIssue("api", 4, {
          title: "Closed a month ago, commented on yesterday",
          state: "closed",
          closed_at: "2026-10-08T09:00:00Z",
          updated_at: "2026-11-06T09:00:00Z",
        }),
        boardIssue("api", 5, {
          title: "A pull request",
          pull_request: { merged: false, draft: false, html_url: "" },
        }),
        boardIssue("api", 6, { title: "High priority, no status", labels: [highPriority] }),
      ],
    }),
    boardRepo("web", {
      writers: ["grace"],
      issues: [
        boardIssue("web", 9, {
          title: "Dark mode toggle",
          labels: [review],
          user: { id: 9, login: "grace" },
          assignees: [
            {
              id: 9,
              login: "grace",
              full_name: "Grace Hopper",
              avatar_url: "https://forgejo.example/avatars/grace",
            },
          ],
          milestone: { id: 3, title: "1.0", state: "open" },
        }),
      ],
    }),
  ])

describe("GET /api/board", () => {
  it("places issues in columns from their status label, state, and close date", async () => {
    // A page size of 2 makes Tabulo follow Forgejo's pagination to see every issue.
    const forgejo = createFakeForgejo({ orgs: [boardOrg()], maxPageSize: 2 })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/board?org=acme&repos=api,web", { headers: { cookie } })

    expect(response.status).toBe(200)
    const board = (await response.json()) as BoardBody
    expect(board.columns).toEqual([
      { _tag: "Todo", key: "todo", title: "Todo" },
      {
        _tag: "Status",
        key: "Status/Backlog",
        title: "Backlog",
        label: { id: 10, name: "Status/Backlog", color: "#c5def5" },
      },
      {
        _tag: "Status",
        key: "Status/In Progress",
        title: "In Progress",
        label: { id: 11, name: "Status/In Progress", color: "#fbca04" },
      },
      {
        _tag: "Status",
        key: "Status/Review",
        title: "Review",
        label: { id: 12, name: "Status/Review", color: "#5319e7" },
      },
      { _tag: "Done", key: "done", title: "Done" },
    ])
    expect(board.failedRepos).toEqual([])
    expect([...board.cards].sort((a, b) => (a.key < b.key ? -1 : 1))).toEqual([
      {
        key: "acme/api#1",
        repo: "api",
        number: 1,
        title: "Plain open issue",
        url: "https://forgejo.example/acme/api/issues/1",
        state: "open",
        labels: [],
        assignees: [],
        milestone: null,
        author: { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
        comments: 0,
        createdAt: "2026-10-01T08:00:00Z",
        updatedAt: "2026-11-01T08:00:00Z",
        closedAt: null,
        column: "todo",
        rank: expect.any(String),
        readOnlyReason: null,
      },
      {
        key: "acme/api#2",
        repo: "api",
        number: 2,
        title: "Retry failed webhooks",
        url: "https://forgejo.example/acme/api/issues/2",
        state: "open",
        labels: [{ id: 20, name: "Kind/Bug", color: "#d73a4a" }],
        assignees: [{ login: "ada", avatarUrl: "" }],
        milestone: null,
        author: { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
        comments: 4,
        createdAt: "2026-10-01T08:00:00Z",
        updatedAt: "2026-11-06T10:00:00Z",
        closedAt: null,
        column: "Status/In Progress",
        rank: expect.any(String),
        readOnlyReason: null,
      },
      expect.objectContaining({
        key: "acme/api#3",
        state: "closed",
        closedAt: "2026-11-04T09:00:00Z",
        column: "done",
      }),
      expect.objectContaining({
        key: "acme/api#6",
        labels: [{ id: 21, name: "Priority/High", color: "#b60205" }],
        column: "todo",
      }),
      {
        key: "acme/web#9",
        repo: "web",
        number: 9,
        title: "Dark mode toggle",
        url: "https://forgejo.example/acme/web/issues/9",
        state: "open",
        labels: [],
        assignees: [{ login: "grace", avatarUrl: "https://forgejo.example/avatars/grace" }],
        milestone: "1.0",
        author: { login: "grace", avatarUrl: "https://forgejo.example/avatars/grace" },
        comments: 0,
        createdAt: "2026-10-01T08:00:00Z",
        updatedAt: "2026-11-01T08:00:00Z",
        closedAt: null,
        column: "Status/Review",
        rank: expect.any(String),
        readOnlyReason: null,
      },
    ])
  })

  it("follows every page when Forgejo leaves out X-Total-Count", async () => {
    // Pages of 2 are below the 50 Tabulo asks for, as with a low MAX_RESPONSE_ITEMS.
    const forgejo = createFakeForgejo({ orgs: [boardOrg()], maxPageSize: 2, omitTotalCount: true })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/board?org=acme&repos=api", { headers: { cookie } })

    const board = (await response.json()) as BoardBody
    expect(board.columns.map((column) => column.key)).toContain("Status/Review")
    expect(board.cards.map((card) => card.key).sort()).toEqual([
      "acme/api#1",
      "acme/api#2",
      "acme/api#3",
      "acme/api#6",
    ])
  })

  it("answers 503 rather than build columns from part of the labels", async () => {
    // At two labels a page, 201 labels need more than the 100 pages one label read may take.
    const org = boardOrg()
    org.labels = [
      ...org.labels,
      ...Array.from({ length: 201 - org.labels.length }, (_, i) =>
        label(1000 + i, `Area/${i}`, "ededed", false),
      ),
    ]
    const { forgejo, call, cookie, move } = await boardSession({ orgs: [org], maxPageSize: 2 })
    const tooManyPages = {
      error: "Too many Forgejo pages for one request; choose fewer repositories",
    }

    const board = await call("/api/board?org=acme&repos=api", { headers: { cookie } })
    expect(board.status).toBe(503)
    expect(await board.json()).toEqual(tooManyPages)

    const moved = await move({ repo: "api", number: 1, toColumn: "Status/Review" })
    expect(moved.status).toBe(503)
    expect(await moved.json()).toEqual(tooManyPages)
    expect(writes(forgejo)).toEqual([])
  })

  it("orders columns as BOARD_COLUMNS says and puts unlisted status labels before Done", async () => {
    const forgejo = createFakeForgejo({ orgs: [boardOrg()] })
    const call = tabulo(forgejo.fetch, {
      clock: createFakeClock().clock,
      vars: {
        BOARD_COLUMNS: "Status/Review, Todo, Status/Retired, Status/In Progress",
        BOARD_DONE_DAYS: "2",
      },
    })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/board?org=acme&repos=api", { headers: { cookie } })

    const board = (await response.json()) as BoardBody
    expect(board.columns.map((column) => column.key)).toEqual([
      "Status/Review",
      "todo",
      "Status/In Progress",
      "Status/Backlog",
      "done",
    ])
    // Closed three days ago is outside a two-day window.
    expect(board.cards.map((card) => card.key)).not.toContain("acme/api#3")
    const closedListing = forgejo.requests.find(
      (r) => r.path === "/api/v1/repos/acme/api/issues" && r.query.get("state") === "closed",
    )
    expect(closedListing?.query.get("since")).toBe("2026-11-05T09:00:00.000Z")
    expect(closedListing?.query.get("type")).toBe("issues")
  })

  it("treats any label named like a status column as that column, and other scope labels as chips", async () => {
    const repoReview = repoLabel("api", 30, "Status/Review", "00aabb", true)
    const abandoned = repoLabel("api", 31, "Status/Abandoned", "999999", true)
    const org = boardOrg()
    org.labels = [...org.labels, retired]
    org.repos = [
      boardRepo("api", {
        labels: [repoReview, abandoned],
        issues: [
          boardIssue("api", 7, { labels: [repoReview, bug] }),
          boardIssue("api", 8, { labels: [abandoned] }),
          boardIssue("api", 9, { labels: [retired] }),
        ],
      }),
    ]
    const forgejo = createFakeForgejo({ orgs: [org] })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/board?org=acme&repos=api", { headers: { cookie } })

    const board = (await response.json()) as BoardBody
    expect(board.columns.map((column) => column.key)).toEqual([
      "todo",
      "Status/Backlog",
      "Status/In Progress",
      "Status/Review",
      "done",
    ])
    const summary = board.cards
      .map((card) => ({
        key: card.key,
        column: card.column,
        labels: card.labels.map((label) => label.name),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : 1))
    expect(summary).toEqual([
      { key: "acme/api#7", column: "Status/Review", labels: ["Kind/Bug"] },
      { key: "acme/api#8", column: "todo", labels: ["Status/Abandoned"] },
      { key: "acme/api#9", column: "todo", labels: ["Status/Retired"] },
    ])
  })

  it("reports a repository whose issues fail to load and still shows the others", async () => {
    const org = boardOrg()
    org.repos.push(boardRepo("docs", { failIssueListing: true }))
    const forgejo = createFakeForgejo({ orgs: [org] })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/board?org=acme&repos=docs,web", { headers: { cookie } })

    expect(response.status).toBe(200)
    const board = (await response.json()) as BoardBody
    expect(board.failedRepos).toEqual([
      { repo: "docs", message: "Forgejo had a problem (HTTP 500); try again in a moment" },
    ])
    expect(board.cards.map((card) => card.key)).toEqual(["acme/web#9"])
  })

  it("reads a repository named twice in different case once", async () => {
    const forgejo = createFakeForgejo({ orgs: [boardOrg()] })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/board?org=ACME&repos=web,WEB", { headers: { cookie } })

    const board = (await response.json()) as BoardBody
    expect(board.cards.map((card) => card.key)).toEqual(["acme/web#9"])
  })

  it.each([
    ["no org", "/api/board?repos=api"],
    ["no repositories", "/api/board?org=acme&repos="],
    ["a path in a repository name", "/api/board?org=acme&repos=api,.."],
    ["a slash in the org", "/api/board?org=acme%2Fapi&repos=api"],
  ])("answers 400 to a board request with %s", async (_, path) => {
    const forgejo = createFakeForgejo({ orgs: [boardOrg()] })
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const response = await call(path, { headers: { cookie } })

    expect(response.status).toBe(400)
    expect(forgejo.requests.filter((r) => r.path.startsWith("/api/v1/orgs"))).toEqual([])
  })
})

describe("GET /api/orgs", () => {
  it("lists the organizations the user belongs to and their repositories", async () => {
    const other = { ...acme([]), name: "globex", full_name: "Globex", members: ["grace"] }
    const forgejo = createFakeForgejo({ orgs: [boardOrg(), other], otherUsers: [grace] })
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const orgs = await call("/api/orgs", { headers: { cookie } })
    const repos = await call("/api/orgs/acme/repos", { headers: { cookie } })

    expect(await orgs.json()).toEqual([
      {
        name: "acme",
        fullName: "Acme Corporation",
        avatarUrl: "https://forgejo.example/avatars/acme",
      },
    ])
    expect(await repos.json()).toEqual([
      { name: "api", fullName: "acme/api", private: true, archived: false },
      { name: "web", fullName: "acme/web", private: true, archived: false },
    ])
  })
})

const writes = (forgejo: ReturnType<typeof createFakeForgejo>) =>
  forgejo.requests
    .filter((r) => r.method !== "GET" && r.path.startsWith("/api/v1/"))
    .map((r) => ({ method: r.method, path: r.path, body: r.json }))

const rankRows = async () =>
  (
    await env.DB.prepare(
      "SELECT org, issue_key, column_key, rank, updated_at, updated_by FROM card_ranks ORDER BY issue_key",
    ).all()
  ).results

const BOARD_COLUMN_LABELS = [backlog.name, inProgress.name, review.name]

type MoveBody = {
  repo: string
  number: number
  fromColumn?: string
  toColumn: string
  afterKey?: string | null
  beforeKey?: string | null
}

const boardSession = async (
  overrides: Parameters<typeof createFakeForgejo>[0] = {},
  vars: Partial<Env> = {},
) => {
  const forgejo = createFakeForgejo({
    orgs: [boardOrg()],
    otherUsers: [grace, outsider],
    ...overrides,
  })
  const clock = createFakeClock()
  const call = tabulo(forgejo.fetch, { clock: clock.clock, vars })
  const cookie = await signIn(call, forgejo)
  // Unless a test says otherwise, the client saw the card where Forgejo has it now.
  const columnInForgejo = (repo: string, number: number) => {
    const issue = forgejo.issue("acme", repo, number)
    if (issue === undefined || issue.state === "closed") return "done"
    return issue.labels.find((label) => BOARD_COLUMN_LABELS.includes(label.name))?.name ?? "todo"
  }
  const move = (
    { afterKey = null, beforeKey = null, fromColumn, ...body }: MoveBody,
    as = cookie,
  ) =>
    call("/api/board/move", {
      method: "POST",
      headers: {
        cookie: as,
        origin: "https://tabulo.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        org: "acme",
        afterKey,
        beforeKey,
        fromColumn: fromColumn ?? columnInForgejo(body.repo, body.number),
        ...body,
      }),
    })
  const board = async (as = cookie, repos = "api,web") =>
    (await (
      await call(`/api/board?org=acme&repos=${repos}`, { headers: { cookie: as } })
    ).json()) as BoardBody
  const post = (path: string, body: unknown, as = cookie) =>
    call(path, {
      method: "POST",
      headers: {
        cookie: as,
        origin: "https://tabulo.example",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  return { forgejo, clock, call, cookie, move, board, post }
}

const labelNames = (issue: { labels: ReadonlyArray<{ name: string }> } | undefined) =>
  issue?.labels.map((label) => label.name).sort()

describe("POST /api/board/move", () => {
  it.each([
    ["a status and a plain label", 2, ["Kind/Bug", "Status/Review"]],
    ["an exclusive label of another scope", 6, ["Priority/High", "Status/Review"]],
  ])(
    "moving an issue with %s to a status column adds only the target label",
    async (_, number, labels) => {
      const { forgejo, move } = await boardSession()

      const response = await move({
        repo: "api",
        number,
        toColumn: "Status/Review",
      })

      expect(response.status).toBe(200)
      expect(writes(forgejo)).toEqual([
        {
          method: "POST",
          path: `/api/v1/repos/acme/api/issues/${number}/labels`,
          body: { labels: [12] },
        },
      ])
      expect(labelNames(forgejo.issue("acme", "api", number))).toEqual(labels)
      expect(await response.json()).toMatchObject({
        card: {
          key: `acme/api#${number}`,
          column: "Status/Review",
          state: "open",
        },
      })
    },
  )

  it("keeps a label added in Forgejo between Tabulo's read and its write", async () => {
    let added = false
    const { forgejo, move } = await boardSession({
      intercept: (method, path) => {
        if (method !== "GET" && path.endsWith("/issues/2/labels") && !added) {
          added = true
          forgejo.issue("acme", "api", 2)?.labels.push(highPriority)
        }
        return undefined
      },
    })

    const response = await move({
      repo: "api",
      number: 2,
      toColumn: "Status/Review",
    })

    expect(response.status).toBe(200)
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual([
      "Kind/Bug",
      "Priority/High",
      "Status/Review",
    ])
    expect(await response.json()).toMatchObject({
      card: {
        labels: [
          { id: 20, name: "Kind/Bug", color: "#d73a4a" },
          { id: 21, name: "Priority/High", color: "#b60205" },
        ],
      },
    })
  })

  it("moving to Done closes the issue and leaves its labels alone", async () => {
    const { forgejo, move } = await boardSession()

    const response = await move({
      repo: "api",
      number: 2,
      toColumn: "done",
    })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      { method: "PATCH", path: "/api/v1/repos/acme/api/issues/2", body: { state: "closed" } },
    ])
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual(["Kind/Bug", "Status/In Progress"])
    expect(await response.json()).toMatchObject({
      card: {
        column: "done",
        state: "closed",
        closedAt: "2026-11-07T09:00:00Z",
        labels: [{ id: 20, name: "Kind/Bug", color: "#d73a4a" }],
      },
    })
  })

  it.each([
    [
      "a status column sets its label, then reopens the issue",
      "Status/In Progress",
      { method: "POST", path: "/api/v1/repos/acme/api/issues/3/labels", body: { labels: [11] } },
      ["Status/In Progress"],
    ],
    [
      "Todo removes its status label, then reopens the issue",
      "todo",
      { method: "DELETE", path: "/api/v1/repos/acme/api/issues/3/labels/Status%2FReview" },
      [],
    ],
  ])("moving out of Done to %s", async (_, toColumn, labelWrite, labels) => {
    const { forgejo, move } = await boardSession()

    const response = await move({ repo: "api", number: 3, toColumn })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      { body: undefined, ...labelWrite },
      { method: "PATCH", path: "/api/v1/repos/acme/api/issues/3", body: { state: "open" } },
    ])
    expect(forgejo.issue("acme", "api", 3)?.state).toBe("open")
    expect(labelNames(forgejo.issue("acme", "api", 3))).toEqual(labels)
    expect(await response.json()).toMatchObject({
      card: { column: toColumn, state: "open", closedAt: null },
    })
  })

  it("answers 502 saying Forgejo applied part of the move when a later step fails", async () => {
    const { forgejo, move } = await boardSession({
      intercept: (method, path) =>
        method === "PATCH" && path === "/api/v1/repos/acme/api/issues/3"
          ? new Response("{}", { status: 500 })
          : undefined,
    })

    const response = await move({
      repo: "api",
      number: 3,
      toColumn: "Status/In Progress",
    })

    expect(response.status).toBe(502)
    expect(((await response.json()) as { error: string }).error).toMatch(
      /Forgejo applied part of the move/,
    )
    expect(labelNames(forgejo.issue("acme", "api", 3))).toEqual(["Status/In Progress"])
    expect(forgejo.issue("acme", "api", 3)?.state).toBe("closed")
    expect(await rankRows()).toEqual([])
  })

  it("moving to Todo removes each status column label, an organization label by name, and keeps the others", async () => {
    const repoReview = repoLabel("api", 30, "Status/Review", "00aabb", true)
    const abandoned = repoLabel("api", 31, "Status/Abandoned", "999999", true)
    const org = boardOrg()
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.labels = [repoReview, abandoned]
    api.issues.push(boardIssue("api", 7, { labels: [repoReview, bug] }))
    const { forgejo, move } = await boardSession({ orgs: [org] })

    const fromOrgLabel = await move({
      repo: "api",
      number: 2,
      toColumn: "todo",
    })
    const fromRepoLabel = await move({
      repo: "api",
      number: 7,
      toColumn: "todo",
    })

    expect([fromOrgLabel.status, fromRepoLabel.status]).toEqual([200, 200])
    expect(writes(forgejo)).toEqual([
      {
        method: "DELETE",
        path: "/api/v1/repos/acme/api/issues/2/labels/Status%2FIn%20Progress",
        body: undefined,
      },
      { method: "DELETE", path: "/api/v1/repos/acme/api/issues/7/labels/30", body: undefined },
    ])
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual(["Kind/Bug"])
    expect(labelNames(forgejo.issue("acme", "api", 7))).toEqual(["Kind/Bug"])
  })

  it("refuses a move to Todo that Forgejo did not apply because a repository label shadows the status label", async () => {
    const org = boardOrg()
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.labels = [repoLabel("api", 30, "Status/In Progress", "00aabb", true)]
    const { forgejo, move, board } = await boardSession({ orgs: [org] })

    const response = await move({ repo: "api", number: 2, toColumn: "todo" })

    expect(response.status).toBe(403)
    expect(labelNames(forgejo.issue("acme", "api", 2))).toContain("Status/In Progress")
    expect((await board()).cards.find((card) => card.key === "acme/api#2")?.column).toBe(
      "Status/In Progress",
    )
  })

  it("refuses a move to Todo before any write when the issue also carries the repository's label of that name", async () => {
    const own = repoLabel("api", 40, "Status/In Progress", "00aabb", false)
    const org = boardOrg()
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.labels = [own]
    api.issues.push(boardIssue("api", 7, { labels: [inProgress, own, bug] }))
    const { forgejo, move } = await boardSession({ orgs: [org] })

    const response = await move({ repo: "api", number: 7, toColumn: "todo" })

    expect(response.status).toBe(403)
    expect(writes(forgejo)).toEqual([])
    expect(labelNames(forgejo.issue("acme", "api", 7))?.sort()).toEqual([
      "Kind/Bug",
      "Status/In Progress",
      "Status/In Progress",
    ])
  })

  it("refuses a move of a closed issue to Todo before reopening it when Forgejo keeps the status label", async () => {
    const org = boardOrg()
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.labels = [repoLabel("api", 30, "Status/Review", "00aabb", true)]
    const { forgejo, move } = await boardSession({ orgs: [org] })

    const response = await move({ repo: "api", number: 3, toColumn: "todo" })

    expect(response.status).toBe(403)
    expect(forgejo.issue("acme", "api", 3)?.state).toBe("closed")
    expect(writes(forgejo).filter((write) => write.method === "PATCH")).toEqual([])
    expect(await rankRows()).toEqual([])
  })

  it("removes a repository's non-exclusive label with a column's name when the card moves to another column", async () => {
    const legacy = repoLabel("api", 40, "Status/In Progress", "00aabb", false)
    const org = boardOrg()
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.labels = [legacy]
    api.issues.push(boardIssue("api", 7, { labels: [legacy, bug] }))
    const { forgejo, move } = await boardSession({ orgs: [org] })

    const response = await move({ repo: "api", number: 7, toColumn: "Status/Review" })

    expect(response.status).toBe(200)
    expect(labelNames(forgejo.issue("acme", "api", 7))?.sort()).toEqual([
      "Kind/Bug",
      "Status/Review",
    ])
    expect(((await response.json()) as { card: { column: string } }).card.column).toBe(
      "Status/Review",
    )
  })

  it("lets a member without push access move a card when Forgejo allows the issue write", async () => {
    const org = boardOrg()
    const web = org.repos[1]
    if (web === undefined) throw new Error("fixture has no web repository")
    web.writers = []
    web.triagers = ["grace"]
    const { forgejo, call, move } = await boardSession({ orgs: [org] })
    const graceCookie = await signIn(call, forgejo, "grace")

    const response = await move(
      { repo: "web", number: 9, toColumn: "Status/In Progress" },
      graceCookie,
    )

    expect(response.status).toBe(200)
    expect(labelNames(forgejo.issue("acme", "web", 9))).toEqual(["Status/In Progress"])
    expect(await rankRows()).toMatchObject([{ issue_key: "acme/web#9", updated_by: "grace" }])
  })

  it("refuses arranging to someone outside the organization and shows them the board read-only", async () => {
    const { forgejo, call, move, board } = await boardSession()
    await move({
      repo: "api",
      number: 6,
      toColumn: "todo",
    })
    const before = await rankRows()
    const outsiderCookie = await signIn(call, forgejo, "linus")

    const reorder = await move({ repo: "api", number: 1, toColumn: "todo" }, outsiderCookie)

    expect(reorder.status).toBe(403)
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual(before)
    expect((await board(outsiderCookie)).viewerCanArrange).toBe(false)
    expect((await board()).viewerCanArrange).toBe(true)
  })

  it("decides membership by the signed-in user, not by the login they had at sign-in", async () => {
    const { forgejo, call, move } = await boardSession()
    const outsiderCookie = await signIn(call, forgejo, "linus")
    // The outsider leaves their login behind, and a member takes it.
    forgejo.renameUser("linus", "linus-old")
    forgejo.renameUser("grace", "linus")

    const shown = await call("/api/board?org=acme&repos=api,web", {
      headers: { cookie: outsiderCookie },
    })
    const before = await rankRows()
    const reorder = await move({ repo: "api", number: 1, toColumn: "todo" }, outsiderCookie)

    expect(shown.status).toBe(200)
    expect(((await shown.json()) as BoardBody).viewerCanArrange).toBe(false)
    expect(reorder.status).toBe(403)
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual(before)
  })

  it("shows the cards of an archived repository read-only and refuses to move them", async () => {
    const org = boardOrg()
    org.repos.push(
      boardRepo("old", { archived: true, issues: [boardIssue("old", 1, { labels: [review] })] }),
    )
    const { forgejo, call, cookie, move } = await boardSession({ orgs: [org] })

    const view = (await (
      await call("/api/board?org=acme&repos=api,old", { headers: { cookie } })
    ).json()) as BoardBody
    const before = await rankRows()
    const response = await move({
      repo: "old",
      number: 1,
      toColumn: "todo",
    })

    expect(view.cards.find((card) => card.key === "acme/old#1")?.readOnlyReason).toBe("archived")
    expect(view.cards.find((card) => card.key === "acme/api#1")?.readOnlyReason).toBe(null)
    expect(response.status).toBe(403)
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual(before)
  })

  it("answers 403 and keeps the order when Forgejo refuses the write", async () => {
    const { forgejo, move } = await boardSession({ tokenScope: "read" })
    await move({
      repo: "api",
      number: 6,
      toColumn: "todo",
    })
    const before = await rankRows()

    const response = await move({
      repo: "api",
      number: 2,
      toColumn: "todo",
    })

    expect(response.status).toBe(403)
    expect(writes(forgejo).map((write) => write.method)).toEqual(["DELETE"])
    expect(await rankRows()).toEqual(before)
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual(["Kind/Bug", "Status/In Progress"])
  })

  it.each([
    ["an unknown column", { toColumn: "Status/Shipped" }],
    ["a neighbour of another organization", { toColumn: "todo", afterKey: "globex/api#1" }],
    ["a neighbour that is not an issue key", { toColumn: "todo", beforeKey: "acme/api" }],
    ["issue number zero", { toColumn: "todo", afterKey: "acme/api#0" }],
    ["a space in a key", { toColumn: "todo", afterKey: "acme/a pi#1" }],
    ["a key over 200 characters", { toColumn: "todo", afterKey: `acme/${"a".repeat(196)}#1` }],
    ["a neighbour in the repository ..", { toColumn: "todo", afterKey: "acme/..#1" }],
    ["an issue number over ten digits", { toColumn: "todo", afterKey: "acme/api#12345678901" }],
    ["a repository name over 100 characters", { toColumn: "todo", repo: "a".repeat(101) }],
    ["the moved card as its own neighbour", { toColumn: "todo", afterKey: "acme/api#2" }],
  ])("answers 400 to %s and writes nothing", async (_, body) => {
    const { forgejo, move } = await boardSession()

    const response = await move({ repo: "api", number: 2, ...body })

    expect(response.status).toBe(400)
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual([])
  })

  it("keeps the move in Forgejo and says so when the order cannot be saved", async () => {
    const { forgejo, move } = await boardSession({}, { DB: failingRankWrites(env.DB) })

    const response = await move({ repo: "api", number: 2, toColumn: "Status/Review" })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      card: { key: "acme/api#2", column: "Status/Review" },
      orderSaved: false,
    })
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual(["Kind/Bug", "Status/Review"])
    expect(await rankRows()).toEqual([])
  })
})

/** A D1 database whose card_ranks writes fail, as when D1 is unavailable. */
const failingRankWrites = (db: D1Database): D1Database =>
  new Proxy(db, {
    get: (target, property) => {
      if (property === "prepare") {
        return (sql: string) =>
          sql.includes("INSERT INTO card_ranks")
            ? { bind: () => ({ run: () => Promise.reject(new Error("D1 is unavailable")) }) }
            : target.prepare(sql)
      }
      const value: unknown = Reflect.get(target, property)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

const columnOrder = (body: BoardBody, column: string) =>
  body.cards
    .filter((card) => card.column === column)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.key < b.key ? -1 : 1))
    .map((card) => card.key)

const orderOrg = () =>
  acme([
    boardRepo("api", {
      writers: ["ada", "grace"],
      issues: [
        boardIssue("api", 1, { updated_at: "2026-11-04T00:00:00Z" }),
        boardIssue("api", 2, { updated_at: "2026-11-01T00:00:00Z" }),
      ],
    }),
    boardRepo("web", {
      writers: ["ada", "grace"],
      issues: [
        boardIssue("web", 1, { updated_at: "2026-11-05T00:00:00Z" }),
        boardIssue("web", 2, { updated_at: "2026-11-03T00:00:00Z" }),
        boardIssue("web", 3, { labels: [inProgress] }),
      ],
    }),
  ])

describe("card order", () => {
  it("keeps the ranks of a repository whose issues do not fit in the pages it reads", async () => {
    const issues = Array.from({ length: 101 }, (_, index) => boardIssue("api", index + 1))
    const { board } = await boardSession({
      orgs: [acme([boardRepo("api", { issues })])],
      maxPageSize: 1,
    })
    await env.DB.prepare(
      `INSERT INTO card_ranks (org, issue_key, column_key, rank, updated_at, updated_by)
       VALUES ('acme', 'acme/api#101', 'todo', 'a0', 0, 'ada')`,
    ).run()

    const shown = await board(undefined, "api")

    expect(shown.cards.map((card) => card.key)).not.toContain("acme/api#101")
    expect(await rankRows()).toContainEqual(
      expect.objectContaining({ issue_key: "acme/api#101", column_key: "todo", rank: "a0" }),
    )
  })

  it("ranks unranked cards on read after the organization's stored order, newest first", async () => {
    const { board } = await boardSession({ orgs: [orderOrg()] })

    await board(undefined, "web")
    const view = await board(undefined, "api")

    expect(view.cards.every((card) => typeof card.rank === "string")).toBe(true)
    const rows = await rankRows()
    expect(
      [...rows]
        .filter((row) => row.column_key === "todo")
        .sort((a, b) => (String(a.rank) < String(b.rank) ? -1 : 1))
        .map((row) => row.issue_key),
    ).toEqual(["acme/web#1", "acme/web#2", "acme/api#1", "acme/api#2"])
    for (const card of view.cards) {
      expect(rows.find((row) => row.issue_key === card.key)).toMatchObject({
        column_key: card.column,
        rank: card.rank,
      })
    }
  })

  it("re-ranks a card moved in Forgejo and forgets issues gone from the selected repositories only", async () => {
    const org = orderOrg()
    const { forgejo, clock, board } = await boardSession({ orgs: [org] })
    await board()
    clock.advance(60_000)
    const issue = forgejo.issue("acme", "api", 1)
    if (issue === undefined) throw new Error("fixture has no acme/api#1")
    issue.labels = [inProgress]
    const api = forgejo.issue("acme", "api", 2)
    if (api === undefined) throw new Error("fixture has no acme/api#2")
    api.state = "closed"
    api.closed_at = "2026-09-01T00:00:00Z"
    const before = await rankRows()

    const view = await board(undefined, "api")

    expect(view.cards.map((card) => card.key)).toEqual(["acme/api#1"])
    const after = await rankRows()
    expect(after.map((row) => row.issue_key)).toEqual([
      "acme/api#1",
      "acme/web#1",
      "acme/web#2",
      "acme/web#3",
    ])
    const webRows = (rows: typeof after) =>
      rows.filter((row) => String(row.issue_key).startsWith("acme/web"))
    expect(webRows(after)).toEqual(webRows(before))
    expect(columnOrder(await board(), "Status/In Progress")).toEqual(["acme/web#3", "acme/api#1"])
  })

  it("keeps one order for boards of different repositories while their users interleave moves", async () => {
    const { forgejo, call, cookie, move, board } = await boardSession({ orgs: [orderOrg()] })
    const graceCookie = await signIn(call, forgejo, "grace")
    const views = async () => ({
      ada: columnOrder(await board(cookie, "api,web"), "todo"),
      grace: columnOrder(await board(graceCookie, "web"), "todo"),
    })
    const tiedRanks = async () => {
      const ranks = (await rankRows()).map((row) => `${row.column_key} ${row.rank}`)
      return ranks.filter((rank, index) => ranks.indexOf(rank) !== index)
    }
    expect(await views()).toEqual({
      ada: ["acme/web#1", "acme/api#1", "acme/web#2", "acme/api#2"],
      grace: ["acme/web#1", "acme/web#2"],
    })

    const graceMoves = await move(
      { repo: "web", number: 3, toColumn: "todo", afterKey: "acme/web#1", beforeKey: "acme/web#2" },
      graceCookie,
    )
    expect(graceMoves.status).toBe(200)
    expect(await tiedRanks()).toEqual([])
    expect(await views()).toEqual({
      ada: ["acme/web#1", "acme/web#3", "acme/api#1", "acme/web#2", "acme/api#2"],
      grace: ["acme/web#1", "acme/web#3", "acme/web#2"],
    })

    const adaMoves = await move({
      repo: "api",
      number: 2,
      toColumn: "todo",
      afterKey: null,
      beforeKey: "acme/web#1",
    })
    expect(adaMoves.status).toBe(200)
    const graceAgain = await move(
      { repo: "web", number: 2, toColumn: "todo", afterKey: "ACME/WEB#1", beforeKey: "acme/web#3" },
      graceCookie,
    )
    expect(graceAgain.status).toBe(200)
    expect(await tiedRanks()).toEqual([])
    expect(await views()).toEqual({
      ada: ["acme/api#2", "acme/web#1", "acme/web#2", "acme/web#3", "acme/api#1"],
      grace: ["acme/web#1", "acme/web#2", "acme/web#3"],
    })
  })

  it("writes only the moved card's rank", async () => {
    const { clock, move, board } = await boardSession({ orgs: [orderOrg()] })
    await board()
    const before = await rankRows()
    clock.advance(60_000)

    const response = await move({
      repo: "api",
      number: 2,
      toColumn: "todo",
      afterKey: null,
      beforeKey: "acme/api#1",
    })

    expect(response.status).toBe(200)
    const after = await rankRows()
    expect(after.filter((row) => row.issue_key !== "acme/api#2")).toEqual(
      before.filter((row) => row.issue_key !== "acme/api#2"),
    )
    expect(after.find((row) => row.issue_key === "acme/api#2")).toMatchObject({
      column_key: "todo",
      updated_by: "ada",
      updated_at: Date.parse("2026-11-07T09:01:00Z"),
    })
    expect(columnOrder(await board(), "todo")).toEqual([
      "acme/api#2",
      "acme/web#1",
      "acme/api#1",
      "acme/web#2",
    ])
  })

  it.each([
    ["a card above that has no rank", { afterKey: "acme/api#99", beforeKey: null }],
    ["a card above in another column", { afterKey: "acme/web#3", beforeKey: null }],
    ["a card below in another column", { afterKey: null, beforeKey: "acme/web#3" }],
    ["a card below that sorts above", { afterKey: "acme/api#2", beforeKey: "acme/api#1" }],
  ])("answers 409 to %s and changes nothing", async (_, neighbours) => {
    const { forgejo, move, board } = await boardSession({ orgs: [orderOrg()] })
    await board()
    const before = await rankRows()

    const response = await move({ repo: "web", number: 1, toColumn: "todo", ...neighbours })

    expect(response.status).toBe(409)
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual(before)
  })

  // A member who cannot read a repository must not learn, from a move's answer, which of its
  // issues exist or which column they are in.
  it.each([
    ["a repository the user cannot see", { hiddenFrom: ["grace"] }],
    ["a repository whose issues the user cannot read", { issuesHiddenFrom: ["grace"] }],
  ])("answers a neighbour in %s as one without a rank", async (_, access) => {
    const org = orderOrg()
    org.repos.push(
      boardRepo("secret", { ...access, issues: [boardIssue("secret", 1, { title: "Plans" })] }),
    )
    const { forgejo, move, board, call } = await boardSession({ orgs: [org] })
    await board(undefined, "api,web,secret")
    const graceCookie = await signIn(call, forgejo, "grace")
    const before = await rankRows()
    expect(before.find((row) => row.issue_key === "acme/secret#1")).toMatchObject({
      column_key: "todo",
    })

    const statuses = []
    for (const afterKey of ["acme/secret#1", "acme/secret#2"]) {
      const response = await move(
        { repo: "api", number: 1, toColumn: "todo", afterKey },
        graceCookie,
      )
      statuses.push(response.status)
    }

    expect(statuses).toEqual([409, 409])
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual(before)
  })
})

type CardResult = {
  card: Card & { assignees: Array<{ login: string; avatarUrl: string }> }
  orderSaved?: boolean
}

describe("POST /api/board/issues", () => {
  it("creates an issue in a column as the user and ranks it first in that column", async () => {
    const { forgejo, board, post } = await boardSession({ orgs: [orderOrg()] })
    await board()

    const inTodo = await post("/api/board/issues", {
      org: "acme",
      repo: "api",
      title: "Write the changelog",
      column: "todo",
    })
    const inProgressColumn = await post("/api/board/issues", {
      org: "acme",
      repo: "web",
      title: "Cache the avatars",
      column: "Status/In Progress",
    })

    expect([inTodo.status, inProgressColumn.status]).toEqual([200, 200])
    expect(writes(forgejo)).toEqual([
      {
        method: "POST",
        path: "/api/v1/repos/acme/api/issues",
        body: { title: "Write the changelog" },
      },
      {
        method: "POST",
        path: "/api/v1/repos/acme/web/issues",
        body: { title: "Cache the avatars", labels: [11] },
      },
    ])
    expect(await inTodo.json()).toEqual({
      card: {
        key: "acme/api#3",
        repo: "api",
        number: 3,
        title: "Write the changelog",
        url: "https://forgejo.example/acme/api/issues/3",
        state: "open",
        labels: [],
        assignees: [],
        milestone: null,
        author: { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
        comments: 0,
        createdAt: "2026-11-07T09:00:00Z",
        updatedAt: "2026-11-07T09:00:00Z",
        closedAt: null,
        column: "todo",
        rank: expect.any(String),
        readOnlyReason: null,
      },
      orderSaved: true,
    })
    expect(await inProgressColumn.json()).toMatchObject({
      card: { key: "acme/web#4", column: "Status/In Progress", labels: [] },
      orderSaved: true,
    })
    expect(labelNames(forgejo.issue("acme", "web", 4))).toEqual(["Status/In Progress"])
    const view = await board()
    expect(columnOrder(view, "todo")).toEqual([
      "acme/api#3",
      "acme/web#1",
      "acme/api#1",
      "acme/web#2",
      "acme/api#2",
    ])
    expect(columnOrder(view, "Status/In Progress")).toEqual(["acme/web#4", "acme/web#3"])
  })

  it("puts the card in Todo when Forgejo drops the status label of a user who cannot write issues", async () => {
    const { forgejo, call, post } = await boardSession()
    const graceCookie = await signIn(call, forgejo, "grace")

    const response = await post(
      "/api/board/issues",
      { org: "acme", repo: "api", title: "Found a typo", column: "Status/Review" },
      graceCookie,
    )

    expect(response.status).toBe(200)
    expect(labelNames(forgejo.issue("acme", "api", 7))).toEqual([])
    expect(await response.json()).toMatchObject({
      card: { key: "acme/api#7", column: "todo", author: { login: "grace" } },
      orderSaved: true,
    })
    expect(await rankRows()).toMatchObject([
      { issue_key: "acme/api#7", column_key: "todo", updated_by: "grace" },
    ])
  })

  it.each([
    ["Done", { column: "done" }, 400],
    ["an empty title", { title: "" }, 400],
    ["a title with surrounding spaces", { title: " Padded " }, 400],
    ["a title over 255 characters", { title: "x".repeat(256) }, 400],
    ["an invalid repository name", { repo: ".." }, 400],
    ["a status column the board no longer has", { column: "Status/Shipped" }, 409],
  ])("answers %s with HTTP %i and creates nothing", async (_, fields, status) => {
    const { forgejo, post } = await boardSession()

    const response = await post("/api/board/issues", {
      org: "acme",
      repo: "api",
      title: "New issue",
      column: "todo",
      ...fields,
    })

    expect(response.status).toBe(status)
    if (status === 409) {
      expect(await response.json()).toMatchObject({ code: "board_changed" })
    }
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual([])
  })

  it("refuses someone outside the organization, an archived repository, and a cross-origin request", async () => {
    const org = boardOrg()
    org.repos.push(boardRepo("old", { archived: true }))
    const { forgejo, call, cookie, post } = await boardSession({ orgs: [org] })
    const outsiderCookie = await signIn(call, forgejo, "linus")
    const body = { org: "acme", repo: "api", title: "New issue", column: "todo" }

    const outsider = await post("/api/board/issues", body, outsiderCookie)
    const archived = await post("/api/board/issues", { ...body, repo: "old" })
    const crossOrigin = await call("/api/board/issues", {
      method: "POST",
      headers: { cookie, origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify(body),
    })

    expect([outsider.status, archived.status, crossOrigin.status]).toEqual([403, 403, 403])
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual([])
  })

  it("keeps the new issue and says so when its rank cannot be saved", async () => {
    const { forgejo, post } = await boardSession({}, { DB: failingRankWrites(env.DB) })

    const response = await post("/api/board/issues", {
      org: "acme",
      repo: "api",
      title: "New issue",
      column: "Status/Backlog",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      card: { key: "acme/api#7", column: "Status/Backlog", rank: expect.any(String) },
      orderSaved: false,
    })
    expect(forgejo.issue("acme", "api", 7)?.title).toBe("New issue")
    expect(await rankRows()).toEqual([])
  })
})

const markdownRenders = (forgejo: ReturnType<typeof createFakeForgejo>) =>
  forgejo.requests.filter((r) => r.path === "/api/v1/markdown").map((r) => r.json)

const assignOrg = () => {
  const org = boardOrg()
  for (const repo of org.repos) repo.writers = ["ada", "grace"]
  org.repos[0]?.issues.push(boardIssue("api", 7, { labels: [backlog], assignees: [ada, grace] }))
  return org
}

describe("POST /api/board/assignees", () => {
  const assigneeLogins = (body: CardResult) => body.card.assignees.map((a) => a.login)

  it("adds the user and keeps the other assignees", async () => {
    const { forgejo, board, post } = await boardSession({ orgs: [assignOrg()] })
    const before = await board()

    const response = await post("/api/board/assignees", {
      org: "acme",
      repo: "web",
      number: 9,
      login: "ada",
      assigned: true,
    })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      {
        method: "PATCH",
        path: "/api/v1/repos/acme/web/issues/9",
        body: { assignees: ["grace", "ada"] },
      },
    ])
    const body = (await response.json()) as CardResult
    expect(body.card.assignees).toEqual([
      { login: "grace", avatarUrl: "https://forgejo.example/avatars/grace" },
      { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
    ])
    expect(body.card).toMatchObject({
      key: "acme/web#9",
      column: "Status/Review",
      rank: before.cards.find((card) => card.key === "acme/web#9")?.rank,
    })
  })

  it("assigns someone else, and removes one assignee while keeping the others", async () => {
    const { forgejo, post } = await boardSession({ orgs: [assignOrg()] })

    const added = await post("/api/board/assignees", {
      org: "acme",
      repo: "api",
      number: 1,
      login: "Grace",
      assigned: true,
    })
    const removed = await post("/api/board/assignees", {
      org: "acme",
      repo: "api",
      number: 7,
      login: "ada",
      assigned: false,
    })

    expect([added.status, removed.status]).toEqual([200, 200])
    expect(writes(forgejo)).toEqual([
      { method: "PATCH", path: "/api/v1/repos/acme/api/issues/1", body: { assignees: ["Grace"] } },
      { method: "PATCH", path: "/api/v1/repos/acme/api/issues/7", body: { assignees: ["grace"] } },
    ])
    expect(assigneeLogins((await added.json()) as CardResult)).toEqual(["grace"])
    const body = (await removed.json()) as CardResult
    expect(assigneeLogins(body)).toEqual(["grace"])
    expect(body.card).toMatchObject({ column: "Status/Backlog", rank: expect.any(String) })
  })

  it.each([
    ["assigning a user who is assigned", 7, "ADA", true, ["ada", "grace"]],
    ["unassigning a user who is not assigned", 1, "ada", false, []],
  ])("writes nothing when %s", async (_, number, login, assigned, logins) => {
    const { forgejo, post } = await boardSession({ orgs: [assignOrg()] })

    const response = await post("/api/board/assignees", {
      org: "acme",
      repo: "api",
      number,
      login,
      assigned,
    })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([])
    expect(assigneeLogins((await response.json()) as CardResult)).toEqual(logins)
  })

  it("answers 403 when Forgejo ignores the assignees from a poster who cannot write issues", async () => {
    const org = boardOrg()
    org.repos[1]?.issues.push(boardIssue("web", 10, { assignees: [grace] }))
    const { forgejo, post } = await boardSession({ orgs: [org] })

    const response = await post("/api/board/assignees", {
      org: "acme",
      repo: "web",
      number: 10,
      login: "ada",
      assigned: true,
    })

    expect(response.status).toBe(403)
    expect(writes(forgejo).map((write) => write.method)).toEqual(["PATCH"])
    expect(forgejo.issue("acme", "web", 10)?.assignees?.map((a) => a.login)).toEqual(["grace"])
  })

  it("refuses a login that is not a Forgejo name without reading the issue", async () => {
    const { forgejo, post } = await boardSession({ orgs: [assignOrg()] })
    const reads = forgejo.requests.length

    const response = await post("/api/board/assignees", {
      org: "acme",
      repo: "api",
      number: 1,
      login: "ada/../grace",
      assigned: true,
    })

    expect(response.status).toBe(400)
    expect(forgejo.requests.length).toBe(reads)
  })
})

describe("POST /api/board/labels", () => {
  const labelOrg = () => {
    const org = boardOrg()
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.labels = [
      repoLabel("api", 30, "Status/Review", "00aabb", true),
      repoLabel("api", 31, "Area/Docs", "0075ca", false),
    ]
    api.issues.push(
      boardIssue("api", 7, {
        labels: [inProgress, repoLabel("api", 31, "Area/Docs", "0075ca", false)],
      }),
    )
    return org
  }
  const setLabel = (
    post: (path: string, body: unknown, as?: string) => Promise<Response>,
    number: number,
    labelId: number,
    present: boolean,
    as?: string,
  ) => post("/api/board/labels", { org: "acme", repo: "api", number, labelId, present }, as)

  it("adds one label without replacing the others and keeps the card's place", async () => {
    const { forgejo, board, post } = await boardSession({ orgs: [labelOrg()] })
    const before = await board()

    const response = await setLabel(post, 2, highPriority.id, true)

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      {
        method: "POST",
        path: "/api/v1/repos/acme/api/issues/2/labels",
        body: { labels: [highPriority.id] },
      },
    ])
    const body = (await response.json()) as CardResult
    expect(body.card.labels.map((label) => label.name).sort()).toEqual([
      "Kind/Bug",
      "Priority/High",
    ])
    expect(body.card).toMatchObject({
      key: "acme/api#2",
      column: "Status/In Progress",
      rank: before.cards.find((card) => card.key === "acme/api#2")?.rank,
    })
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual([
      "Kind/Bug",
      "Priority/High",
      "Status/In Progress",
    ])
  })

  it("removes an organization label by name and a repository label by id", async () => {
    const org = labelOrg()
    org.repos[0]?.issues.push(boardIssue("api", 8, { labels: [bug] }))
    const { forgejo, post } = await boardSession({ orgs: [org] })

    const orgLabel = await setLabel(post, 8, bug.id, false)
    const ownLabel = await setLabel(post, 7, 31, false)

    expect([orgLabel.status, ownLabel.status]).toEqual([200, 200])
    expect(writes(forgejo)).toEqual([
      {
        method: "DELETE",
        path: "/api/v1/repos/acme/api/issues/8/labels/Kind%2FBug",
        body: undefined,
      },
      { method: "DELETE", path: "/api/v1/repos/acme/api/issues/7/labels/31", body: undefined },
    ])
    expect(((await orgLabel.json()) as CardResult).card.labels).toEqual([])
    const body = (await ownLabel.json()) as CardResult
    expect(body.card).toMatchObject({ labels: [], column: "Status/In Progress" })
    expect(labelNames(forgejo.issue("acme", "api", 7))).toEqual(["Status/In Progress"])
  })

  it.each([
    ["adding a label the issue has", 2, bug.id, true],
    ["removing a label the issue lacks", 1, bug.id, false],
    ["removing a label Forgejo does not have", 1, 999, false],
  ])("writes nothing when %s", async (_, number, labelId, present) => {
    const { forgejo, post } = await boardSession({ orgs: [labelOrg()] })

    const response = await setLabel(post, number, labelId, present)

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([])
  })

  it.each([
    ["an organization status label", inProgress.id, false, 7],
    ["a repository label named like a status column", 30, true, 1],
  ])("refuses %s, because columns change through moves", async (_, labelId, present, number) => {
    const { forgejo, post } = await boardSession({ orgs: [labelOrg()] })

    const response = await setLabel(post, number, labelId, present)

    expect(response.status).toBe(400)
    expect(writes(forgejo)).toEqual([])
  })

  it("answers 403 when Forgejo ignores a label it does not know", async () => {
    const { forgejo, post } = await boardSession({ orgs: [labelOrg()] })

    const response = await setLabel(post, 1, 999, true)

    expect(response.status).toBe(403)
    expect(writes(forgejo).map((write) => write.method)).toEqual(["POST"])
    expect(forgejo.issue("acme", "api", 1)?.labels).toEqual([])
  })

  it("passes on Forgejo's 403 to a member who cannot write the repository's issues", async () => {
    const { forgejo, call, post } = await boardSession({ orgs: [labelOrg()] })
    const graceCookie = await signIn(call, forgejo, "grace")

    const response = await setLabel(post, 1, bug.id, true, graceCookie)

    expect(response.status).toBe(403)
    expect(forgejo.issue("acme", "api", 1)?.labels).toEqual([])
  })
})

describe("POST /api/board/milestone", () => {
  const milestoneOrg = () => {
    const org = assignOrg()
    const [api, web] = org.repos
    if (api === undefined || web === undefined) throw new Error("fixture lacks a repository")
    api.milestones = [milestone(5, "2.0"), milestone(6, "1.9", "closed")]
    web.milestones = [milestone(3, "1.0")]
    return org
  }
  const setMilestone = (
    post: (path: string, body: unknown, as?: string) => Promise<Response>,
    repo: string,
    number: number,
    milestoneId: number | null,
    as?: string,
  ) => post("/api/board/milestone", { org: "acme", repo, number, milestoneId }, as)

  it("sets a milestone, and clears one by sending milestone 0", async () => {
    const { forgejo, board, post } = await boardSession({ orgs: [milestoneOrg()] })
    const before = await board()

    const set = await setMilestone(post, "api", 1, 5)
    const cleared = await setMilestone(post, "web", 9, null)

    expect([set.status, cleared.status]).toEqual([200, 200])
    expect(writes(forgejo)).toEqual([
      { method: "PATCH", path: "/api/v1/repos/acme/api/issues/1", body: { milestone: 5 } },
      { method: "PATCH", path: "/api/v1/repos/acme/web/issues/9", body: { milestone: 0 } },
    ])
    expect(((await set.json()) as CardResult).card).toMatchObject({
      key: "acme/api#1",
      milestone: "2.0",
      column: "todo",
      rank: before.cards.find((card) => card.key === "acme/api#1")?.rank,
    })
    expect(((await cleared.json()) as CardResult).card).toMatchObject({ milestone: null })
    expect(forgejo.issue("acme", "web", 9)?.milestone).toBeNull()
  })

  it.each([
    ["setting the milestone the issue has", "web", 9, 3],
    ["clearing a milestone the issue lacks", "api", 1, null],
  ])("writes nothing when %s", async (_, repo, number, milestoneId) => {
    const { forgejo, post } = await boardSession({ orgs: [milestoneOrg()] })

    const response = await setMilestone(post, repo, number, milestoneId)

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([])
  })

  it("passes on Forgejo's refusals: 403 without issue write access, 502 for an unknown milestone", async () => {
    const org = milestoneOrg()
    for (const repo of org.repos) repo.writers = ["ada"]
    const { forgejo, call, post } = await boardSession({ orgs: [org] })
    const graceCookie = await signIn(call, forgejo, "grace")

    const forbidden = await setMilestone(post, "api", 1, 5, graceCookie)
    const unknown = await setMilestone(post, "api", 1, 77)

    expect([forbidden.status, unknown.status]).toEqual([403, 502])
    expect(forgejo.issue("acme", "api", 1)?.milestone).toBeNull()
  })
})

describe("POST /api/board/comment", () => {
  it("comments as the user and answers with the comment as Forgejo renders it", async () => {
    const { forgejo, call, cookie, post } = await boardSession()

    const response = await post("/api/board/comment", {
      org: "acme",
      repo: "api",
      number: 1,
      body: "Looks <fine>\nto me",
    })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      {
        method: "POST",
        path: "/api/v1/repos/acme/api/issues/1/comments",
        body: { body: "Looks <fine>\nto me" },
      },
      expect.objectContaining({ method: "POST", path: "/api/v1/markdown" }),
    ])
    const { comment } = (await response.json()) as { comment: unknown }
    expect(comment).toEqual({
      id: expect.any(Number),
      author: { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
      createdAt: "2026-11-07T09:00:00Z",
      bodyHtml: "<p>Looks &lt;fine&gt;<br>\nto me</p>",
    })
    expect(markdownRenders(forgejo)).toEqual([
      { Mode: "comment", Context: "https://forgejo.example/acme/api", Text: "Looks <fine>\nto me" },
    ])
    const detail = await call("/api/board/issue?org=acme&repo=api&number=1", {
      headers: { cookie },
    })
    expect(await detail.json()).toMatchObject({ comments: [comment], commentCount: 1 })
    expect(forgejo.issue("acme", "api", 1)?.comments).toBe(1)
  })

  // Forgejo rejects a token that expires between the comment and its render; Tabulo then
  // refreshes the token and runs the request again, which must not post the comment twice.
  it("posts the comment once when Forgejo rejects the token while rendering it", async () => {
    let renders = 0
    const { forgejo, post } = await boardSession({
      intercept: (method, path) =>
        method === "POST" && path === "/api/v1/markdown" && renders++ === 0
          ? new Response(null, { status: 401 })
          : undefined,
    })

    const response = await post("/api/board/comment", {
      org: "acme",
      repo: "api",
      number: 1,
      body: "Once <only>",
    })

    expect(response.status).toBe(200)
    expect(
      writes(forgejo).filter((write) => write.path === "/api/v1/repos/acme/api/issues/1/comments"),
    ).toHaveLength(1)
    expect(((await response.json()) as { comment: { bodyHtml: string } }).comment.bodyHtml).toBe(
      "<p>Once &lt;only&gt;</p>",
    )
  })

  it("lets someone outside the organization comment when Forgejo allows it", async () => {
    const { forgejo, call, post } = await boardSession()
    const outsiderCookie = await signIn(call, forgejo, "linus")

    const response = await post(
      "/api/board/comment",
      { org: "acme", repo: "web", number: 9, body: "Me too" },
      outsiderCookie,
    )

    expect(response.status).toBe(200)
    expect(
      ((await response.json()) as { comment: { author: { login: string } } }).comment.author.login,
    ).toBe("linus")
  })

  it.each([
    ["an empty body", ""],
    ["a body with surrounding space", " Hi "],
    ["a body over 65535 characters", "x".repeat(65_536)],
  ])("refuses %s without writing", async (_, body) => {
    const { forgejo, post } = await boardSession()

    const response = await post("/api/board/comment", { org: "acme", repo: "api", number: 1, body })

    expect(response.status).toBe(400)
    expect(writes(forgejo)).toEqual([])
  })

  it("passes on Forgejo's 403 for a locked issue the user cannot write", async () => {
    const org = boardOrg()
    org.repos[0]?.issues.push(boardIssue("api", 7, { is_locked: true }))
    const { forgejo, call, post } = await boardSession({ orgs: [org] })
    const graceCookie = await signIn(call, forgejo, "grace")

    const response = await post(
      "/api/board/comment",
      { org: "acme", repo: "api", number: 7, body: "Hello" },
      graceCookie,
    )

    expect(response.status).toBe(403)
    expect(forgejo.issue("acme", "api", 7)?.comments).toBe(0)
  })
})

describe("card edits", () => {
  const edits = [
    ["/api/board/assignees", { login: "ada", assigned: true }],
    ["/api/board/labels", { labelId: bug.id, present: true }],
    ["/api/board/milestone", { milestoneId: null }],
    ["/api/board/comment", { body: "Hello" }],
  ] as const

  it.each(edits)(
    "%s refuses an archived repository, a pull request, an invalid name or number, and a cross-origin request without writing",
    async (path, fields) => {
      const org = boardOrg()
      org.repos.push(
        boardRepo("old", {
          archived: true,
          issues: [boardIssue("old", 1, { milestone: { id: 1, title: "x", state: "open" } })],
        }),
      )
      const { forgejo, call, cookie, post } = await boardSession({ orgs: [org] })
      const target = { org: "acme", repo: "api", number: 1, ...fields }

      const responses = await Promise.all([
        post(path, { ...target, repo: "old" }),
        post(path, { ...target, number: 5 }),
        post(path, { ...target, repo: ".." }),
        post(path, { ...target, number: 0 }),
        post(path, { ...target, number: undefined }),
        call(path, {
          method: "POST",
          headers: { cookie, origin: "https://evil.example", "content-type": "application/json" },
          body: JSON.stringify(target),
        }),
      ])

      expect(responses.map((response) => response.status)).toEqual([403, 400, 400, 400, 400, 403])
      expect(writes(forgejo)).toEqual([])
    },
  )

  it.each(edits)(
    "%s passes on Forgejo's 403 to a token that may only read",
    async (path, fields) => {
      const org = boardOrg()
      org.repos[0]?.issues.push(
        boardIssue("api", 7, { milestone: { id: 1, title: "x", state: "open" } }),
      )
      const { forgejo, post } = await boardSession({ orgs: [org], tokenScope: "read" })

      const response = await post(path, { org: "acme", repo: "api", number: 7, ...fields })

      expect(response.status).toBe(403)
      expect(forgejo.issue("acme", "api", 7)).toMatchObject({
        labels: [],
        assignees: null,
        comments: 0,
      })
    },
  )
})

describe("GET /api/board/issue", () => {
  const detailOrg = () => {
    const org = boardOrg()
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.issues.push(
      boardIssue("api", 7, { body: "Steps to <reproduce>:\nopen the page\n\nIt breaks." }),
    )
    return org
  }

  it("answers with the description rendered by Forgejo, to anyone who can read the issue", async () => {
    const { forgejo, call, cookie } = await boardSession({ orgs: [detailOrg()] })
    const outsiderCookie = await signIn(call, forgejo, "linus")

    const member = await call("/api/board/issue?org=acme&repo=api&number=7", {
      headers: { cookie },
    })
    const outsider = await call("/api/board/issue?org=ACME&repo=API&number=7", {
      headers: { cookie: outsiderCookie },
    })

    const detail = {
      key: "acme/api#7",
      bodyHtml: "<p>Steps to &lt;reproduce&gt;:<br>\nopen the page</p>\n<p>It breaks.</p>",
      comments: [],
      commentCount: 0,
    }
    expect([member.status, outsider.status]).toEqual([200, 200])
    expect(await member.json()).toEqual(detail)
    expect(await outsider.json()).toEqual(detail)
    expect(markdownRenders(forgejo)[0]).toEqual({
      Mode: "comment",
      Context: "https://forgejo.example/acme/api",
      Text: "Steps to <reproduce>:\nopen the page\n\nIt breaks.",
    })
  })

  it("answers an empty description without asking Forgejo to render it", async () => {
    const { forgejo, call, cookie } = await boardSession()

    const response = await call("/api/board/issue?org=acme&repo=api&number=1", {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      key: "acme/api#1",
      bodyHtml: "",
      comments: [],
      commentCount: 0,
    })
    expect(markdownRenders(forgejo)).toEqual([])
  })

  it("answers the latest 20 comments oldest first, each rendered like the description, and the full count", async () => {
    const org = boardOrg()
    const commentRecords = Array.from({ length: 52 }, (_, index) =>
      issueComment(
        "api",
        7,
        100 + index,
        index % 2 === 0 ? ada : grace,
        index === 51 ? "" : `Comment **${index}**`,
        `2026-11-0${1 + Math.floor(index / 10)}T09:${String(index).padStart(2, "0")}:00Z`,
      ),
    )
    org.repos[0]?.issues.push(boardIssue("api", 7, { commentRecords }))
    const { forgejo, call, cookie } = await boardSession({ orgs: [org] })

    const response = await call("/api/board/issue?org=acme&repo=api&number=7", {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
    const detail = (await response.json()) as {
      comments: Array<{
        id: number
        author: { login: string }
        createdAt: string
        bodyHtml: string
      }>
      commentCount: number
    }
    expect(detail.commentCount).toBe(52)
    expect(detail.comments.map((comment) => comment.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => 132 + index),
    )
    expect(detail.comments[0]).toEqual({
      id: 132,
      author: { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
      createdAt: "2026-11-04T09:32:00Z",
      bodyHtml: "<p>Comment **32**</p>",
    })
    expect(detail.comments[19]).toMatchObject({ id: 151, author: { login: "grace" }, bodyHtml: "" })
    const renders = markdownRenders(forgejo) as Array<{
      Mode: string
      Context: string
      Text: string
    }>
    expect(renders.map((render) => render.Text).sort()).toEqual(
      Array.from({ length: 19 }, (_, index) => `Comment **${index + 32}**`).sort(),
    )
    expect(new Set(renders.map((render) => `${render.Mode} ${render.Context}`))).toEqual(
      new Set(["comment https://forgejo.example/acme/api"]),
    )
  })

  it("renders at most four Markdown texts at once", async () => {
    const org = boardOrg()
    const commentRecords = Array.from({ length: 20 }, (_, index) =>
      issueComment("api", 7, 100 + index, ada, `Comment ${index}`, "2026-11-01T09:00:00Z"),
    )
    org.repos[0]?.issues.push(boardIssue("api", 7, { body: "Body", commentRecords }))
    const forgejo = createFakeForgejo({ orgs: [org], otherUsers: [grace, outsider] })
    let open = 0
    let mostOpen = 0
    const call = tabulo(async (request) => {
      if (new URL(request.url).pathname !== "/api/v1/markdown") return forgejo.fetch(request)
      open += 1
      mostOpen = Math.max(mostOpen, open)
      for (let turn = 0; turn < 20; turn++) await Promise.resolve()
      open -= 1
      return forgejo.fetch(request)
    })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/board/issue?org=acme&repo=api&number=7", {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
    expect(markdownRenders(forgejo)).toHaveLength(21)
    expect(mostOpen).toBe(4)
  })

  it.each([
    ["no number", "/api/board/issue?org=acme&repo=api", 400],
    ["number zero", "/api/board/issue?org=acme&repo=api&number=0", 400],
    ["a path in the repository", "/api/board/issue?org=acme&repo=..&number=1", 400],
    ["an issue Forgejo does not have", "/api/board/issue?org=acme&repo=api&number=99", 404],
  ])("answers %s with HTTP %i", async (_, path, status) => {
    const { call, cookie } = await boardSession()

    const response = await call(path, { headers: { cookie } })

    expect(response.status).toBe(status)
  })
})

describe("GET /api/board/issue-options", () => {
  it("lists labels without status column or archived labels, open milestones, and assignable users", async () => {
    const org = boardOrg()
    org.labels = [...org.labels, retired, { ...bug, id: 22, name: "Kind/Old", is_archived: true }]
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    api.writers = ["ada"]
    api.triagers = ["grace"]
    api.labels = [
      repoLabel("api", 30, "Status/Review", "00aabb", true),
      repoLabel("api", 31, "Status/Abandoned", "999999", true),
      repoLabel("api", 32, "Area/Docs", "0075ca", false),
    ]
    api.milestones = [
      milestone(5, "2.0"),
      milestone(6, "1.9", "closed"),
      milestone(7, "2.1"),
      milestone(8, "3.0"),
    ]
    const forgejo = createFakeForgejo({
      orgs: [org],
      otherUsers: [grace, outsider],
      maxPageSize: 2,
    })
    const call = tabulo(forgejo.fetch)
    const outsiderCookie = await signIn(call, forgejo, "linus")

    const response = await call("/api/board/issue-options?org=acme&repo=api", {
      headers: { cookie: outsiderCookie },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      labels: [
        { id: 32, name: "Area/Docs", color: "#0075ca" },
        { id: 20, name: "Kind/Bug", color: "#d73a4a" },
        { id: 21, name: "Priority/High", color: "#b60205" },
        { id: 31, name: "Status/Abandoned", color: "#999999" },
      ],
      milestones: [
        { id: 5, title: "2.0" },
        { id: 7, title: "2.1" },
        { id: 8, title: "3.0" },
      ],
      assignees: [
        { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
        { login: "grace", avatarUrl: "https://forgejo.example/avatars/grace" },
      ],
    })
    expect(
      forgejo.requests
        .filter((r) => r.path === "/api/v1/repos/acme/api/milestones")
        .map((r) => r.query.get("state")),
    ).toEqual(["open", "open"])
  })

  it.each([
    ["no repository", "/api/board/issue-options?org=acme", 400],
    ["a path for a repository", "/api/board/issue-options?org=acme&repo=..", 400],
    ["a repository Forgejo does not have", "/api/board/issue-options?org=acme&repo=nope", 404],
  ])("answers %s with HTTP %i", async (_, path, status) => {
    const { call, cookie } = await boardSession()

    const response = await call(path, { headers: { cookie } })

    expect(response.status).toBe(status)
  })
})
