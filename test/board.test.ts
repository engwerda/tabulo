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
  review,
} from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

type Card = { key: string; column: string; rank: string | null }
type BoardBody = {
  columns: Array<{ key: string }>
  cards: Array<Card>
  failedRepos: Array<unknown>
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
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
