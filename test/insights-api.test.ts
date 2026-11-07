import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import type { Activity, Insights } from "../src/shared/api.ts"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo, type FakeActionRun, type FakeIssue } from "./fake-forgejo.ts"
import { acme, boardIssue, boardRepo, grace } from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
  ])
})

const mergedPull = (repo: string, number: number, created: string, merged: string): FakeIssue =>
  boardIssue(repo, number, {
    title: `Pull ${number}`,
    html_url: `https://forgejo.example/acme/${repo}/pulls/${number}`,
    state: "closed",
    user: { id: 9, login: "grace", avatar_url: grace.avatar_url },
    created_at: created,
    updated_at: merged,
    closed_at: merged,
    pull_request: { merged: true, merged_at: merged, draft: false, html_url: "" },
  })

const actionRun = (
  number: number,
  status: string,
  created: string,
  minutes: number,
): FakeActionRun => {
  const stopped = new Date(Date.parse(created) + minutes * 60_000).toISOString()
  return {
    id: 500 + number,
    title: `Run ${number}`,
    status,
    workflow_id: "ci.yml",
    index_in_repo: number,
    prettyref: "main",
    event: "push",
    html_url: `https://forgejo.example/acme/api/actions/runs/${number}`,
    created,
    updated: stopped,
    started: created,
    stopped,
    duration: minutes * 60 * 1e9,
  }
}

const insightsOrg = () =>
  acme([
    boardRepo("api", {
      issues: [
        boardIssue("api", 1, { title: "Open bug", created_at: "2026-10-20T08:00:00Z" }),
        boardIssue("api", 2, {
          title: "Closed this month",
          state: "closed",
          created_at: "2026-10-01T08:00:00Z",
          closed_at: "2026-10-31T08:00:00Z",
          updated_at: "2026-10-31T08:00:00Z",
          assignees: [
            { id: 9, login: "grace", full_name: "Grace Hopper", avatar_url: grace.avatar_url },
          ],
        }),
        mergedPull("api", 3, "2026-11-02T08:00:00Z", "2026-11-03T08:00:00Z"),
      ],
      // Newest first, as Forgejo lists them; the last is older than both windows.
      actionRuns: [
        actionRun(4, "success", "2026-11-06T10:00:00Z", 12),
        actionRun(3, "failure", "2026-11-05T10:00:00Z", 8),
        actionRun(2, "success", "2026-11-04T10:00:00Z", 10),
        actionRun(1, "success", "2026-01-04T10:00:00Z", 10),
      ],
      languages: { TypeScript: 9000, CSS: 1000 },
      milestones: [
        {
          id: 31,
          title: "1.0",
          description: "",
          state: "open",
          open_issues: 1,
          closed_issues: 1,
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
          closed_at: null,
          due_on: "2026-11-01T00:00:00Z",
        },
      ],
    }),
    // No actionRuns: Forgejo answers 404, as for a repository with Actions turned off.
    boardRepo("web", { issues: [boardIssue("web", 7, { title: "Web issue" })] }),
    boardRepo("broken", { failIssueListing: true }),
  ])

const setup = async (overrides: Parameters<typeof createFakeForgejo>[0] = {}) => {
  const forgejo = createFakeForgejo({ orgs: [insightsOrg()], maxPageSize: 2, ...overrides })
  const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
  const cookie = await signIn(call, forgejo)
  return { forgejo, call, cookie }
}

describe("GET /api/insights", () => {
  it("aggregates the chosen repositories and lists the ones that failed", async () => {
    const { forgejo, call, cookie } = await setup()

    const response = await call(
      "/api/insights?org=acme&repos=api,web,broken&days=30&tz=Europe/Amsterdam",
      { headers: { cookie } },
    )

    expect(response.status).toBe(200)
    const insights = (await response.json()) as Insights
    expect(insights).toMatchObject({ org: "acme", days: 30, tz: "Europe/Amsterdam" })
    expect(insights.failedRepos).toEqual([{ repo: "broken", message: "Forgejo returned HTTP 500" }])
    expect(insights.repoStats.map((repo) => repo.name)).toEqual(["api", "web"])
    expect(insights.tiles.openIssues.value).toBe(2)
    expect(insights.tiles.issuesClosed.value).toBe(1)
    expect(insights.tiles.pullsMerged.value).toBe(1)
    expect(insights.tiles.medianPullMergeHours.value).toBe(24)
    expect(
      insights.contributors.map((person) => [
        person.login,
        person.pullsMerged,
        person.issuesClosed,
      ]),
    ).toEqual([["grace", 1, 1]])
    expect(insights.ci).toMatchObject({ runs: 3, medianDurationMinutes: 10 })
    expect(insights.ci?.successRate).toBeCloseTo(2 / 3)
    expect(insights.repoStats.find((repo) => repo.name === "web")?.ci).toBeNull()
    expect(insights.languages).toEqual([
      { name: "TypeScript", bytes: 9000 },
      { name: "CSS", bytes: 1000 },
    ])
    expect(insights.milestones).toEqual([
      {
        repo: "api",
        title: "1.0",
        url: "https://forgejo.example/acme/api/milestone/31",
        openIssues: 1,
        closedIssues: 1,
        dueOn: "2026-11-01T00:00:00Z",
      },
    ])
    expect(insights.attention.map((item) => item.kind)).toContain("overdue_milestone")

    const forgejoReads = forgejo.requests.filter((request) =>
      request.path.startsWith("/api/v1/repos/"),
    )
    expect(new Set(forgejoReads.map((request) => request.authorization))).toEqual(
      new Set(["Bearer access-1"]),
    )
    // Closed issues and pull requests since the start of the window before the shown one.
    const closedListing = forgejoReads.find(
      (request) =>
        request.path === "/api/v1/repos/acme/api/issues" && request.query.get("state") === "closed",
    )
    // The window starts at midnight on Monday 5 October in Amsterdam, 22:00 UTC the day before.
    expect(closedListing?.query.get("since")).toBe("2026-09-01T11:00:00.000Z")
    expect(closedListing?.query.has("type")).toBe(false)
    // Paging stops at the first page that reaches back past the previous window.
    const runPages = forgejoReads
      .filter((request) => request.path === "/api/v1/repos/acme/api/actions/runs")
      .map((request) => request.query.get("page"))
    expect(runPages).toEqual(["1", "2"])
  })

  it("reads every workflow run in the window, without an empty page at the end", async () => {
    // 1,050 runs, newest first and 30 seconds apart: 1,000 passed, then 50 failed.
    const runs = Array.from({ length: 1050 }, (_, index) =>
      actionRun(
        1050 - index,
        index < 1000 ? "success" : "failure",
        new Date(Date.UTC(2026, 10, 7, 8, 0) - index * 30_000).toISOString(),
        1,
      ),
    )
    const { forgejo, call, cookie } = await setup({
      orgs: [acme([boardRepo("api", { actionRuns: runs })])],
      maxPageSize: 50,
    })

    const response = await call("/api/insights?org=acme&repos=api&days=30&tz=UTC", {
      headers: { cookie },
    })

    const insights = (await response.json()) as Insights
    expect(insights.ci?.runs).toBe(1050)
    expect(insights.ci?.successRate).toBeCloseTo(1000 / 1050)
    expect(insights.incomplete).toEqual([])
    const runPages = forgejo.requests.filter(
      (request) => request.path === "/api/v1/repos/acme/api/actions/runs",
    )
    expect(runPages).toHaveLength(21)
  })

  it("shares a page budget fairly between repositories and says what it did not read", async () => {
    const manyRuns = Array.from({ length: 1000 }, (_, index) =>
      actionRun(
        1000 - index,
        "success",
        new Date(Date.UTC(2026, 10, 7, 8, 0) - index * 60_000).toISOString(),
        1,
      ),
    )
    const { forgejo, call, cookie } = await setup({
      orgs: [
        acme([
          boardRepo("api", { actionRuns: manyRuns }),
          boardRepo("web", { actionRuns: manyRuns }),
        ]),
      ],
    })
    const before = forgejo.requests.length

    const response = await call("/api/insights?org=acme&repos=api,web&days=30&tz=UTC", {
      headers: { cookie },
    })

    const insights = (await response.json()) as Insights
    expect(insights.failedRepos).toEqual([])
    expect(insights.incomplete).toEqual([
      { repo: "api", listing: "runs" },
      { repo: "web", listing: "runs" },
    ])
    // Two runs a page: each repository reads most of its half of the 800 listing pages.
    for (const repo of insights.repoStats) expect(repo.ci?.runs).toBeGreaterThan(780)
    const listingPages = forgejo.requests
      .slice(before)
      .filter((request) => /\/(issues|actions\/runs|milestones)$/.test(request.path))
    expect(listingPages).toHaveLength(800)
  })

  it("keeps one page budget when a late 401 refreshes the token", async () => {
    const manyRuns = Array.from({ length: 1000 }, (_, index) =>
      actionRun(
        1000 - index,
        "success",
        new Date(Date.UTC(2026, 10, 7, 8, 0) - index * 60_000).toISOString(),
        1,
      ),
    )
    let runPages = 0
    const { forgejo, call, cookie } = await setup({
      orgs: [
        acme([
          boardRepo("api", { actionRuns: manyRuns }),
          boardRepo("web", { actionRuns: manyRuns }),
        ]),
      ],
      // Forgejo rejects the token after 600 of the 800 listing pages.
      intercept: (_, path) =>
        path.endsWith("/actions/runs") && ++runPages === 600
          ? new Response(null, { status: 401 })
          : undefined,
    })
    const before = forgejo.requests.length

    const response = await call("/api/insights?org=acme&repos=api,web&days=30&tz=UTC", {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
    const reads = forgejo.requests.slice(before)
    expect(reads.filter(({ path }) => path === "/login/oauth/access_token")).toHaveLength(1)
    const listingPages = reads.filter(({ path }) =>
      /\/(issues|actions\/runs|milestones)$/.test(path),
    )
    expect(listingPages.length).toBeLessThanOrEqual(800)
    expect(reads.length).toBeLessThan(1000)
  })

  it.each([
    ["days=7&tz=UTC", "days must be one of 30, 90, 180, 365"],
    ["days=30&tz=Mars/Olympus_Mons", "tz is not a known time zone"],
  ])("answers 400 to %s", async (query, error) => {
    const { forgejo, call, cookie } = await setup()

    const response = await call(`/api/insights?org=acme&repos=api&${query}`, {
      headers: { cookie },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
    expect(forgejo.requests.some((request) => request.path.startsWith("/api/v1/repos/"))).toBe(
      false,
    )
  })

  it("answers 400 to more than 20 repositories", async () => {
    const { call, cookie } = await setup()
    const repos = Array.from({ length: 21 }, (_, index) => `repo${index}`).join(",")

    const response = await call(`/api/insights?org=acme&repos=${repos}&days=30&tz=UTC`, {
      headers: { cookie },
    })

    expect(response.status).toBe(400)
  })

  it("answers 401 without a session", async () => {
    const { call } = await setup()

    expect((await call("/api/insights?org=acme&repos=api&days=30&tz=UTC")).status).toBe(401)
  })
})

describe("GET /api/activity", () => {
  it("sums the signed-in user's heatmap per day in the time zone", async () => {
    const at = (iso: string, contributions: number) => ({
      timestamp: Date.parse(iso) / 1000,
      contributions,
    })
    const { forgejo, call, cookie } = await setup({
      heatmap: [at("2026-11-05T23:30:00Z", 2), at("2026-11-06T08:00:00Z", 3)],
    })

    const response = await call("/api/activity?tz=Asia/Tokyo", { headers: { cookie } })

    expect(response.status).toBe(200)
    const activity = (await response.json()) as Activity
    // 23:30 UTC on 5 November is 6 November in Tokyo.
    expect(activity.days.find((day) => day.date === "2026-11-06")?.count).toBe(5)
    expect(activity).toMatchObject({ total: 5, currentStreak: 1, longestStreak: 1 })
    expect(forgejo.requests.some((request) => request.path === "/api/v1/users/ada/heatmap")).toBe(
      true,
    )
  })

  it("answers 400 to an unknown time zone", async () => {
    const { call, cookie } = await setup()

    expect((await call("/api/activity?tz=Nowhere", { headers: { cookie } })).status).toBe(400)
  })
})
