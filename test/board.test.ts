import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo } from "./fake-forgejo.ts"
import {
  acme,
  boardIssue,
  boardRepo,
  bug,
  grace,
  highPriority,
  inProgress,
  repoLabel,
  retired,
  review,
} from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

type Card = {
  key: string
  column: string
  rank: string | null
  labels: Array<{ name: string }>
}
type BoardBody = {
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
        updatedAt: "2026-11-01T08:00:00Z",
        closedAt: null,
        column: "todo",
        rank: null,
        canWrite: true,
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
        updatedAt: "2026-11-06T10:00:00Z",
        closedAt: null,
        column: "Status/In Progress",
        rank: null,
        canWrite: true,
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
        updatedAt: "2026-11-01T08:00:00Z",
        closedAt: null,
        column: "Status/Review",
        rank: null,
        canWrite: false,
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
      { name: "api", fullName: "acme/api", private: true, canWrite: true },
      { name: "web", fullName: "acme/web", private: true, canWrite: false },
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

const boardSession = async (overrides: Parameters<typeof createFakeForgejo>[0] = {}) => {
  const forgejo = createFakeForgejo({ orgs: [boardOrg()], otherUsers: [grace], ...overrides })
  const clock = createFakeClock()
  const call = tabulo(forgejo.fetch, { clock: clock.clock })
  const cookie = await signIn(call, forgejo)
  const move = (body: {
    repo: string
    number: number
    toColumn: string
    orderedKeys: ReadonlyArray<string>
  }) =>
    call("/api/board/move", {
      method: "POST",
      headers: { cookie, origin: "https://tabulo.example", "content-type": "application/json" },
      body: JSON.stringify({ org: "acme", ...body }),
    })
  const board = async (as = cookie) =>
    (await (
      await call("/api/board?org=acme&repos=api,web", { headers: { cookie: as } })
    ).json()) as BoardBody
  return { forgejo, clock, call, cookie, move, board }
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
        orderedKeys: [`acme/api#${number}`],
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
        key: `acme/api#${number}`,
        column: "Status/Review",
        state: "open",
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
      orderedKeys: ["acme/api#2"],
    })

    expect(response.status).toBe(200)
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual([
      "Kind/Bug",
      "Priority/High",
      "Status/Review",
    ])
    expect(await response.json()).toMatchObject({
      labels: [
        { id: 20, name: "Kind/Bug", color: "#d73a4a" },
        { id: 21, name: "Priority/High", color: "#b60205" },
      ],
    })
  })

  it("moving to Done closes the issue and leaves its labels alone", async () => {
    const { forgejo, move } = await boardSession()

    const response = await move({
      repo: "api",
      number: 2,
      toColumn: "done",
      orderedKeys: ["acme/api#2", "acme/api#3"],
    })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      { method: "PATCH", path: "/api/v1/repos/acme/api/issues/2", body: { state: "closed" } },
    ])
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual(["Kind/Bug", "Status/In Progress"])
    expect(await response.json()).toMatchObject({
      column: "done",
      state: "closed",
      closedAt: "2026-11-07T09:00:00Z",
      labels: [{ id: 20, name: "Kind/Bug", color: "#d73a4a" }],
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
      { method: "DELETE", path: "/api/v1/repos/acme/api/issues/3/labels/12" },
      [],
    ],
  ])("moving out of Done to %s", async (_, toColumn, labelWrite, labels) => {
    const { forgejo, move } = await boardSession()

    const response = await move({ repo: "api", number: 3, toColumn, orderedKeys: ["acme/api#3"] })

    expect(response.status).toBe(200)
    expect(writes(forgejo)).toEqual([
      { body: undefined, ...labelWrite },
      { method: "PATCH", path: "/api/v1/repos/acme/api/issues/3", body: { state: "open" } },
    ])
    expect(forgejo.issue("acme", "api", 3)?.state).toBe("open")
    expect(labelNames(forgejo.issue("acme", "api", 3))).toEqual(labels)
    expect(await response.json()).toMatchObject({ column: toColumn, state: "open", closedAt: null })
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
      orderedKeys: ["acme/api#3"],
    })

    expect(response.status).toBe(502)
    expect(((await response.json()) as { error: string }).error).toMatch(
      /Forgejo applied part of the move/,
    )
    expect(labelNames(forgejo.issue("acme", "api", 3))).toEqual(["Status/In Progress"])
    expect(forgejo.issue("acme", "api", 3)?.state).toBe("closed")
    expect(await rankRows()).toEqual([])
  })

  it("moving to Todo removes each status column label and keeps the others", async () => {
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
      orderedKeys: ["acme/api#1", "acme/api#2", "acme/api#6"],
    })
    const fromRepoLabel = await move({
      repo: "api",
      number: 7,
      toColumn: "todo",
      orderedKeys: ["acme/api#7"],
    })

    expect([fromOrgLabel.status, fromRepoLabel.status]).toEqual([200, 200])
    expect(writes(forgejo)).toEqual([
      { method: "DELETE", path: "/api/v1/repos/acme/api/issues/2/labels/11", body: undefined },
      { method: "DELETE", path: "/api/v1/repos/acme/api/issues/7/labels/30", body: undefined },
    ])
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual(["Kind/Bug"])
    expect(labelNames(forgejo.issue("acme", "api", 7))).toEqual(["Kind/Bug"])
  })

  it("stores the column order for everyone, and a move between ranked cards writes one row", async () => {
    const { forgejo, clock, call, move, board } = await boardSession()
    const todoOrder = (body: BoardBody) =>
      body.cards
        .filter((card) => card.column === "todo")
        .sort((a, b) => ((a.rank ?? "") < (b.rank ?? "") ? -1 : 1))
        .map((card) => card.key)

    const reorder = await move({
      repo: "api",
      number: 6,
      toColumn: "todo",
      orderedKeys: ["acme/api#6", "acme/api#1"],
    })
    expect(reorder.status).toBe(200)
    expect(writes(forgejo)).toEqual([])
    expect(todoOrder(await board())).toEqual(["acme/api#6", "acme/api#1"])

    const before = await rankRows()
    clock.advance(60_000)
    const between = await move({
      repo: "api",
      number: 2,
      toColumn: "todo",
      orderedKeys: ["acme/api#6", "acme/api#2", "acme/api#1"],
    })
    expect(between.status).toBe(200)
    const after = await rankRows()
    expect(after.filter((row) => row.issue_key !== "acme/api#2")).toEqual(before)
    expect(after.find((row) => row.issue_key === "acme/api#2")).toMatchObject({
      org: "acme",
      column_key: "todo",
      updated_by: "ada",
    })

    const graceCookie = await signIn(call, forgejo, "grace")
    for (const view of [await board(), await board(graceCookie)]) {
      expect(todoOrder(view)).toEqual(["acme/api#6", "acme/api#2", "acme/api#1"])
    }
  })

  it("refuses a move in a repository the user cannot write, without writing anything", async () => {
    const { forgejo, move } = await boardSession()
    await move({
      repo: "api",
      number: 6,
      toColumn: "todo",
      orderedKeys: ["acme/api#6", "acme/api#1"],
    })
    const before = await rankRows()

    const response = await move({
      repo: "web",
      number: 9,
      toColumn: "todo",
      orderedKeys: ["acme/web#9", "acme/api#6", "acme/api#1"],
    })

    expect(response.status).toBe(403)
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual(before)
    expect(labelNames(forgejo.issue("acme", "web", 9))).toEqual(["Status/Review"])
  })

  it("answers 403 and keeps the order when Forgejo refuses the write", async () => {
    const { forgejo, move } = await boardSession({ tokenScope: "read" })
    await move({
      repo: "api",
      number: 6,
      toColumn: "todo",
      orderedKeys: ["acme/api#6", "acme/api#1"],
    })
    const before = await rankRows()

    const response = await move({
      repo: "api",
      number: 2,
      toColumn: "todo",
      orderedKeys: ["acme/api#2", "acme/api#6", "acme/api#1"],
    })

    expect(response.status).toBe(403)
    expect(writes(forgejo).map((write) => write.method)).toEqual(["DELETE"])
    expect(await rankRows()).toEqual(before)
    expect(labelNames(forgejo.issue("acme", "api", 2))).toEqual(["Kind/Bug", "Status/In Progress"])
  })

  it.each([
    ["an unknown column", { toColumn: "Status/Shipped", orderedKeys: ["acme/api#2"] }],
    ["an order without the moved card", { toColumn: "todo", orderedKeys: ["acme/api#1"] }],
    ["an order with a card twice", { toColumn: "todo", orderedKeys: ["acme/api#2", "acme/api#2"] }],
    [
      "a card of another organization",
      { toColumn: "todo", orderedKeys: ["acme/api#2", "evil/x#1"] },
    ],
  ])("answers 400 to %s and writes nothing", async (_, body) => {
    const { forgejo, move } = await boardSession()

    const response = await move({ repo: "api", number: 2, ...body })

    expect(response.status).toBe(400)
    expect(writes(forgejo)).toEqual([])
    expect(await rankRows()).toEqual([])
  })
})
