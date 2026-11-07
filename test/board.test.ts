import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo } from "./fake-forgejo.ts"
import {
  acme,
  backlog,
  boardIssue,
  boardRepo,
  bug,
  grace,
  highPriority,
  inProgress,
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
    expect(board.failedRepos).toEqual([{ repo: "docs", message: "Forgejo returned HTTP 500" }])
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

describe("POST /api/board/assign", () => {
  const assignOrg = () => {
    const org = boardOrg()
    for (const repo of org.repos) repo.writers = ["ada", "grace"]
    const api = org.repos[0]
    if (api === undefined) throw new Error("fixture has no api repository")
    const ada = {
      id: 7,
      login: "ada",
      full_name: "Ada Lovelace",
      avatar_url: "https://forgejo.example/avatars/ada",
    }
    api.issues.push(boardIssue("api", 7, { labels: [backlog], assignees: [ada, grace] }))
    return org
  }
  const assigneeLogins = (body: CardResult) => body.card.assignees

  it("adds the user and keeps the other assignees", async () => {
    const { forgejo, board, post } = await boardSession({ orgs: [assignOrg()] })
    const before = await board()

    const response = await post("/api/board/assign", {
      org: "acme",
      repo: "web",
      number: 9,
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
    expect(assigneeLogins(body)).toEqual([
      { login: "grace", avatarUrl: "https://forgejo.example/avatars/grace" },
      { login: "ada", avatarUrl: "https://forgejo.example/avatars/ada" },
    ])
    expect(body.card).toMatchObject({
      key: "acme/web#9",
      column: "Status/Review",
      rank: before.cards.find((card) => card.key === "acme/web#9")?.rank,
    })
  })

  it("removes the user and keeps the other assignees", async () => {
    const { forgejo, post } = await boardSession({ orgs: [assignOrg()] })

    const response = await post("/api/board/assign", {
      org: "acme",
      repo: "api",
      number: 7,
      assigned: false,
    })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      {
        method: "PATCH",
        path: "/api/v1/repos/acme/api/issues/7",
        body: { assignees: ["grace"] },
      },
    ])
    const body = (await response.json()) as CardResult
    expect(assigneeLogins(body).map((assignee) => assignee.login)).toEqual(["grace"])
    expect(body.card).toMatchObject({ column: "Status/Backlog", rank: expect.any(String) })
  })

  it.each([
    ["assigning a user who is assigned", 7, true, ["ada", "grace"]],
    ["unassigning a user who is not assigned", 1, false, []],
  ])("writes nothing when %s", async (_, number, assigned, logins) => {
    const { forgejo, post } = await boardSession({ orgs: [assignOrg()] })

    const response = await post("/api/board/assign", { org: "acme", repo: "api", number, assigned })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([])
    const body = (await response.json()) as CardResult
    expect(assigneeLogins(body).map((assignee) => assignee.login)).toEqual(logins)
  })

  it("answers 403 when Forgejo ignores the assignees from a poster who cannot write issues", async () => {
    const org = boardOrg()
    org.repos[1]?.issues.push(boardIssue("web", 10, { assignees: [grace] }))
    const { forgejo, post } = await boardSession({ orgs: [org] })

    const response = await post("/api/board/assign", {
      org: "acme",
      repo: "web",
      number: 10,
      assigned: true,
    })

    expect(response.status).toBe(403)
    expect(writes(forgejo).map((write) => write.method)).toEqual(["PATCH"])
    expect(forgejo.issue("acme", "web", 10)?.assignees?.map((a) => a.login)).toEqual(["grace"])
  })

  it("refuses an archived repository, a pull request, and an invalid number without writing", async () => {
    const org = assignOrg()
    org.repos.push(boardRepo("old", { archived: true, issues: [boardIssue("old", 1)] }))
    const { forgejo, post } = await boardSession({ orgs: [org] })

    const archived = await post("/api/board/assign", {
      org: "acme",
      repo: "old",
      number: 1,
      assigned: true,
    })
    const pull = await post("/api/board/assign", {
      org: "acme",
      repo: "api",
      number: 5,
      assigned: true,
    })
    const zero = await post("/api/board/assign", {
      org: "acme",
      repo: "api",
      number: 0,
      assigned: true,
    })

    expect([archived.status, pull.status, zero.status]).toEqual([403, 400, 400])
    expect(writes(forgejo)).toEqual([])
  })
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
    }
    expect([member.status, outsider.status]).toEqual([200, 200])
    expect(await member.json()).toEqual(detail)
    expect(await outsider.json()).toEqual(detail)
    const renders = forgejo.requests.filter((r) => r.path === "/api/v1/markdown")
    expect(renders[0]?.json).toEqual({
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
    expect(await response.json()).toEqual({ key: "acme/api#1", bodyHtml: "" })
    expect(forgejo.requests.filter((r) => r.path === "/api/v1/markdown")).toEqual([])
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
