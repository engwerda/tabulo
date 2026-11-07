import { describe, expect, it } from "vitest"
import type { AttentionItem } from "../src/shared/api.ts"
import { buildActivity } from "../src/worker/activity.ts"
import type {
  ForgejoActionRun,
  ForgejoInsightIssue,
  ForgejoInsightRepo,
} from "../src/worker/forgejo/schemas.ts"
import {
  buildInsights,
  byUrgency,
  type InsightsInput,
  quantile,
  type RepoActivity,
  type RepoFacts,
  repoHealth,
} from "../src/worker/insights.ts"

// Saturday 7 November 2026, 09:00 UTC.
const NOW = Date.UTC(2026, 10, 7, 9, 0)

const repo = (name: string, fields: Partial<ForgejoInsightRepo> = {}): ForgejoInsightRepo => ({
  name,
  full_name: `acme/${name}`,
  private: true,
  archived: false,
  html_url: `https://forgejo.example/acme/${name}`,
  default_branch: "main",
  updated_at: "2026-11-06T10:00:00Z",
  ...fields,
})

const person = (login: string) => ({
  login,
  avatar_url: `https://forgejo.example/avatars/${login}`,
})

const issue = (number: number, fields: Partial<ForgejoInsightIssue> = {}): ForgejoInsightIssue => ({
  number,
  title: `Issue ${number}`,
  html_url: `https://forgejo.example/acme/api/issues/${number}`,
  state: fields.closed_at == null ? "open" : "closed",
  user: person("ada"),
  labels: [],
  assignees: null,
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-11-06T08:00:00Z",
  closed_at: null,
  pull_request: null,
  ...fields,
})

const pull = (
  number: number,
  created: string,
  merged: string | null,
  fields: Partial<ForgejoInsightIssue> = {},
): ForgejoInsightIssue =>
  issue(number, {
    html_url: `https://forgejo.example/acme/api/pulls/${number}`,
    created_at: created,
    closed_at: merged,
    state: merged === null ? "open" : "closed",
    pull_request: { merged: merged !== null, merged_at: merged, draft: false },
    ...fields,
  })

const run = (
  status: string,
  created: string,
  minutes: number,
  fields: Partial<ForgejoActionRun> = {},
): ForgejoActionRun => ({
  status,
  workflow_id: "ci.yml",
  prettyref: "main",
  html_url: `https://forgejo.example/acme/api/actions/runs/${created}`,
  created,
  started: created,
  stopped: new Date(Date.parse(created) + minutes * 60_000).toISOString(),
  ...fields,
})

const activity = (fields: Partial<RepoActivity> = {}): RepoActivity => ({
  repo: repo("api"),
  open: [],
  closed: [],
  runs: null,
  languages: {},
  milestones: [],
  ...fields,
})

const insights = (loaded: ReadonlyArray<RepoActivity>, fields: Partial<InsightsInput> = {}) =>
  buildInsights({
    org: "acme",
    repos: loaded.map((entry) => entry.repo.name),
    days: 30,
    tz: "UTC",
    now: NOW,
    loaded,
    failedRepos: [],
    ...fields,
  })

describe("buildInsights", () => {
  it("buckets weeks and the punchcard in the request's time zone", () => {
    // Sunday 1 November 23:30 in UTC is Monday 2 November 12:30 in Auckland (UTC+13).
    const created = "2026-11-01T23:30:00Z"
    const loaded = [activity({ open: [issue(1, { created_at: created })] })]

    const auckland = insights(loaded, { tz: "Pacific/Auckland" })
    const utc = insights(loaded, { tz: "UTC" })

    const openedIn = (result: typeof utc) =>
      result.weekly.filter((week) => week.issuesOpened > 0).map((week) => week.weekStart)
    expect(openedIn(auckland)).toEqual(["2026-11-02"])
    expect(openedIn(utc)).toEqual(["2026-10-26"])
    expect(auckland.punchcard[0]?.[12]).toBe(1)
    expect(utc.punchcard[6]?.[23]).toBe(1)
    // The window starts on Thursday 8 October; its first week starts on Monday 5 October.
    expect(utc.weekly.map((week) => week.weekStart)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ])
  })

  it("counts the backlog at each week's end and at the window start", () => {
    const loaded = [
      activity({
        open: [
          issue(1, { created_at: "2026-09-01T08:00:00Z" }),
          issue(2, { created_at: "2026-10-20T08:00:00Z" }),
        ],
        closed: [
          // Open at the window start, closed in the week of 12 October.
          issue(3, { created_at: "2026-09-01T08:00:00Z", closed_at: "2026-10-14T08:00:00Z" }),
          // Opened and closed in the week of 26 October.
          issue(4, { created_at: "2026-10-26T08:00:00Z", closed_at: "2026-10-28T08:00:00Z" }),
          // Closed before the window, updated since: never in the backlog shown.
          issue(5, { created_at: "2026-08-01T08:00:00Z", closed_at: "2026-09-15T08:00:00Z" }),
        ],
      }),
    ]

    const result = insights(loaded)

    expect(result.weekly.map((week) => week.openIssues)).toEqual([2, 1, 2, 2, 2])
    expect(result.tiles.openIssues).toEqual({ value: 2, previous: 2 })
    expect(result.tiles.issuesOpened).toEqual({ value: 2, previous: 0 })
    expect(result.tiles.issuesClosed).toEqual({ value: 2, previous: 1 })
  })

  it("counts pull requests apart from issues", () => {
    const loaded = [
      activity({
        open: [issue(1), pull(2, "2026-11-03T08:00:00Z", null)],
        closed: [pull(3, "2026-11-02T08:00:00Z", "2026-11-02T20:00:00Z")],
      }),
    ]

    const result = insights(loaded)

    expect(result.tiles.openIssues.value).toBe(1)
    expect(result.tiles.openPulls.value).toBe(1)
    expect(result.tiles.pullsMerged.value).toBe(1)
    expect(result.weekly.at(-1)).toMatchObject({ issuesOpened: 0, pullsOpened: 2, pullsMerged: 1 })
    expect(result.issueAge.reduce((total, bucket) => total + bucket.count, 0)).toBe(1)
  })

  it("reports merge time percentiles and buckets for pulls merged in the window", () => {
    const hoursAfter = (start: string, hours: number) =>
      new Date(Date.parse(start) + hours * 3_600_000).toISOString()
    const start = "2026-10-20T00:00:00Z"
    const loaded = [
      activity({
        closed: [2, 10, 30, 400].map((hours, index) =>
          pull(index + 1, start, hoursAfter(start, hours)),
        ),
      }),
    ]

    const { pullMergeTime, tiles } = insights(loaded)

    expect(pullMergeTime.p50).toBe(20)
    expect(pullMergeTime.p75).toBe(122.5)
    expect(pullMergeTime.p90).toBe(289)
    expect(tiles.medianPullMergeHours).toEqual({ value: 20, previous: null })
    expect(pullMergeTime.buckets).toEqual([
      { label: "< 1h", count: 0 },
      { label: "1–4h", count: 1 },
      { label: "4–24h", count: 1 },
      { label: "1–3d", count: 1 },
      { label: "3–7d", count: 0 },
      { label: "1–2w", count: 0 },
      { label: "> 2w", count: 1 },
    ])
  })

  it("summarizes CI from passed and failed runs, and is null without Actions data", () => {
    const withCi = insights([
      activity({
        runs: [
          run("success", "2026-11-05T10:00:00Z", 10),
          run("success", "2026-11-04T10:00:00Z", 20),
          run("failure", "2026-11-03T10:00:00Z", 40),
          run("cancelled", "2026-11-02T10:00:00Z", 5),
          // Previous window.
          run("failure", "2026-09-20T10:00:00Z", 10),
        ],
      }),
    ])

    expect(withCi.ci).toMatchObject({ runs: 4, medianDurationMinutes: 20 })
    expect(withCi.ci?.successRate).toBeCloseTo(2 / 3)
    expect(withCi.tiles.ciSuccessRate.previous).toBe(0)
    expect(withCi.ci?.weekly.at(-1)).toEqual({
      weekStart: "2026-11-02",
      success: 2,
      failure: 1,
      other: 1,
    })
    expect(insights([activity()]).ci).toBeNull()
    expect(insights([activity()]).tiles.ciSuccessRate).toEqual({ value: null, previous: null })
  })

  it("lists what needs attention, most urgent first", () => {
    const loaded = [
      activity({
        open: [
          pull(1, "2026-10-01T08:00:00Z", null, { updated_at: "2026-10-20T08:00:00Z" }),
          pull(2, "2026-10-01T08:00:00Z", null, { updated_at: "2026-10-30T08:00:00Z" }),
          pull(3, "2026-10-01T08:00:00Z", null, {
            updated_at: "2026-10-01T08:00:00Z",
            pull_request: { merged: false, merged_at: null, draft: true },
          }),
          issue(4, { updated_at: "2026-09-01T08:00:00Z", assignees: [person("grace")] }),
          issue(5, { updated_at: "2026-09-01T08:00:00Z" }),
        ],
        runs: [
          run("failure", "2026-11-06T10:00:00Z", 5),
          run("failure", "2026-11-04T10:00:00Z", 5),
          run("success", "2026-11-01T10:00:00Z", 5),
          run("failure", "2026-11-06T11:00:00Z", 5, { prettyref: "feature" }),
        ],
        milestones: [
          { id: 8, title: "1.0", open_issues: 2, closed_issues: 3, due_on: "2026-11-01T00:00:00Z" },
          {
            id: 9,
            title: "Done",
            open_issues: 0,
            closed_issues: 5,
            due_on: "2026-10-01T00:00:00Z",
          },
        ],
      }),
    ]

    const { attention } = insights(loaded)

    expect(attention.map(({ kind, title, ageDays }) => [kind, title, ageDays])).toEqual([
      ["failing_ci", "ci on main", 2],
      ["overdue_milestone", "1.0", 6],
      ["stale_pull", "Issue 1", 18],
      ["stale_pull", "Issue 2", 8],
      ["stale_issue", "Issue 4", 67],
    ])
    expect(attention[0]?.detail).toBe("The last 2 runs failed")
    expect(attention[1]?.url).toBe("https://forgejo.example/acme/api/milestone/8")
  })

  it("reads failing CI from the latest finished run of each workflow on the default branch", () => {
    const failing = (runs: ReadonlyArray<ForgejoActionRun>) => {
      const result = insights([activity({ runs })])
      return {
        attention: result.attention.flatMap((item) =>
          item.kind === "failing_ci" ? [[item.title, item.detail]] : [],
        ),
        failsOnDefaultBranch: result.repoStats[0]?.health.reasons.includes(
          "CI fails on the default branch",
        ),
      }
    }

    // A newer cancelled or skipped run means the workflow is not failing.
    for (const status of ["cancelled", "skipped"]) {
      expect(
        failing([
          run(status, "2026-11-06T10:00:00Z", 1),
          run("failure", "2026-11-04T10:00:00Z", 5),
        ]),
      ).toEqual({ attention: [], failsOnDefaultBranch: false })
    }
    // A run still in progress has not finished, so the failure before it is the latest.
    expect(
      failing([
        run("running", "2026-11-06T12:00:00Z", 0, { stopped: null }),
        run("failure", "2026-11-06T10:00:00Z", 5),
        run("success", "2026-11-01T10:00:00Z", 5),
      ]),
    ).toEqual({
      attention: [["ci on main", "The latest run failed"]],
      failsOnDefaultBranch: true,
    })
  })

  it("has no duration for a run whose start or stop is unset", () => {
    const result = insights([
      activity({
        runs: [
          run("success", "2026-11-06T10:00:00Z", 10),
          run("success", "2026-11-05T10:00:00Z", 30),
          // Forgejo can send Go's zero time, or the Unix epoch, for a time it never set.
          run("success", "2026-11-04T10:00:00Z", 0, { started: "0001-01-01T00:00:00Z" }),
          run("failure", "2026-11-03T10:00:00Z", 0, { started: "1970-01-01T00:00:00Z" }),
          run("cancelled", "2026-11-02T10:00:00Z", 0, { started: null }),
        ],
      }),
    ])

    expect(result.ci?.medianDurationMinutes).toBe(20)
    expect(result.ci?.slowestWorkflows[0]?.medianDurationMinutes).toBe(20)
  })

  it("counts an issue as closed by its state when Forgejo sends no close time", () => {
    const result = insights([
      activity({
        closed: [
          issue(1, {
            state: "closed",
            closed_at: null,
            created_at: "2026-11-01T08:00:00Z",
            updated_at: "2026-11-03T08:00:00Z",
          }),
        ],
      }),
    ])

    expect(result.tiles.openIssues.value).toBe(0)
    expect(result.tiles.issuesClosed.value).toBe(1)
    expect(result.tiles.medianIssueCloseHours.value).toBe(48)
  })

  it("credits merged pulls to authors and closed issues to assignees", () => {
    const loaded = [
      activity({
        closed: [
          pull(1, "2026-11-01T08:00:00Z", "2026-11-02T08:00:00Z", { user: person("grace") }),
          issue(2, {
            closed_at: "2026-11-03T08:00:00Z",
            assignees: [person("grace"), person("ada")],
          }),
        ],
      }),
    ]

    expect(insights(loaded).contributors).toEqual([
      {
        login: "grace",
        avatarUrl: "https://forgejo.example/avatars/grace",
        pullsMerged: 1,
        issuesClosed: 1,
      },
      {
        login: "ada",
        avatarUrl: "https://forgejo.example/avatars/ada",
        pullsMerged: 0,
        issuesClosed: 1,
      },
    ])
  })
})

describe("quantile", () => {
  it("interpolates between ranks", () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.9)).toBeCloseTo(3.7)
    expect(quantile([7], 0.9)).toBe(7)
    expect(quantile([], 0.5)).toBeNull()
  })
})

describe("repoHealth", () => {
  const healthy: RepoFacts = {
    archived: false,
    ciSuccessRate: 1,
    failingDefaultBranch: false,
    medianMergeHours: 5,
    stalePulls: 0,
    openIssues: 10,
    openIssuesAtStart: 10,
    daysSinceActivity: 1,
    overdueMilestones: 0,
  }

  it("is strong with no reasons when no rule applies", () => {
    expect(repoHealth(healthy)).toEqual({ score: 100, status: "strong", reasons: [] })
  })

  it("subtracts each rule's penalty and lists the largest first", () => {
    expect(repoHealth({ ...healthy, ciSuccessRate: 0.85, stalePulls: 2, openIssues: 16 })).toEqual({
      score: 60,
      status: "watch",
      reasons: [
        "CI passes 85% of runs",
        "Open issues grew from 10 to 16",
        "2 pull requests idle for a week or more",
      ],
    })
  })

  it("is risky when several things are wrong, never below zero", () => {
    const health = repoHealth({
      ...healthy,
      ciSuccessRate: 0.5,
      failingDefaultBranch: true,
      medianMergeHours: 400,
      stalePulls: 9,
      daysSinceActivity: 90,
      overdueMilestones: 3,
    })
    expect(health.score).toBe(0)
    expect(health.status).toBe("risky")
    expect(health.reasons[0]).toBe("CI passes 50% of runs")
  })

  it("does not count inactivity against an archived repository", () => {
    expect(repoHealth({ ...healthy, archived: true, daysSinceActivity: 400 }).score).toBe(100)
  })
})

describe("byUrgency", () => {
  it("orders by kind, then oldest first", () => {
    const item = (kind: AttentionItem["kind"], ageDays: number): AttentionItem => ({
      kind,
      repo: "api",
      title: `${kind} ${ageDays}`,
      url: "",
      detail: "",
      ageDays,
    })
    const sorted = [
      item("stale_issue", 90),
      item("stale_pull", 8),
      item("failing_ci", 1),
      item("stale_pull", 30),
      item("overdue_milestone", 2),
    ].sort(byUrgency)
    expect(sorted.map((entry) => entry.title)).toEqual([
      "failing_ci 1",
      "overdue_milestone 2",
      "stale_pull 30",
      "stale_pull 8",
      "stale_issue 90",
    ])
  })
})

describe("buildActivity", () => {
  const at = (iso: string, contributions: number) => ({
    timestamp: Date.parse(iso) / 1000,
    contributions,
  })

  it("sums contributions per day in the time zone and measures streaks", () => {
    const entries = [
      // 22:00 UTC on 4 November is 5 November in Bangkok (UTC+7).
      at("2026-11-04T22:00:00Z", 3),
      at("2026-11-05T10:00:00Z", 2),
      at("2026-11-06T10:00:00Z", 1),
      at("2026-10-01T10:00:00Z", 1),
      at("2026-10-02T10:00:00Z", 1),
      at("2026-10-03T10:00:00Z", 9),
      at("2026-10-04T10:00:00Z", 1),
    ]

    const result = buildActivity(entries, "Asia/Bangkok", NOW)

    expect(result.days).toHaveLength(365)
    expect(result.days.at(-1)).toEqual({ date: "2026-11-07", count: 0 })
    expect(result.days.find((day) => day.date === "2026-11-05")?.count).toBe(5)
    expect(result.total).toBe(18)
    // Today has no contribution yet, so the streak through yesterday still counts.
    expect(result.currentStreak).toBe(2)
    expect(result.longestStreak).toBe(4)
    expect(result.busiestDay).toEqual({ date: "2026-10-03", count: 9 })
  })

  it("has no busiest day and no streak without contributions", () => {
    expect(buildActivity([], "UTC", NOW)).toMatchObject({
      total: 0,
      currentStreak: 0,
      longestStreak: 0,
      busiestDay: null,
    })
  })
})
