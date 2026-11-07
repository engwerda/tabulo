import { describe, expect, it } from "vitest"
import { formatHours, niceTicks } from "../src/client/charts/scale.ts"
import { insightsSummary } from "../src/client/insights/summary.ts"
import type { Insights } from "../src/shared/api.ts"

const insights: Insights = {
  org: "acme",
  repos: ["api", "web"],
  days: 30,
  tz: "Europe/Amsterdam",
  generatedAt: "2026-11-07T09:00:00.000Z",
  window: { start: "2026-10-08T09:00:00.000Z", end: "2026-11-07T09:00:00.000Z" },
  tiles: {
    openIssues: { value: 12, previous: 9 },
    openPulls: { value: 3, previous: 4 },
    issuesOpened: { value: 8, previous: 5 },
    issuesClosed: { value: 5, previous: 6 },
    pullsMerged: { value: 7, previous: 2 },
    medianIssueCloseHours: { value: 30, previous: null },
    medianPullMergeHours: { value: null, previous: null },
    ciSuccessRate: { value: 0.75, previous: 0.5 },
  },
  weekly: [],
  pullMergeTime: { p50: null, p75: null, p90: null, buckets: [] },
  issueAge: [],
  labels: [],
  contributors: [],
  punchcard: [],
  languages: [],
  ci: null,
  milestones: [],
  attention: [
    {
      kind: "failing_ci",
      repo: "api",
      title: "ci on main",
      url: "https://forgejo.example/acme/api/actions/runs/9",
      detail: "The latest run failed",
      ageDays: 1,
    },
  ],
  repoStats: [
    {
      name: "web",
      url: "https://forgejo.example/acme/web",
      archived: false,
      openIssues: 4,
      openPulls: 1,
      issuesClosed: 2,
      pullsMerged: 3,
      lastActivity: "2026-11-06T09:00:00.000Z",
      languages: [],
      ci: null,
      activity: [],
      health: { score: 100, status: "strong", reasons: [] },
    },
    {
      name: "api",
      url: "https://forgejo.example/acme/api",
      archived: false,
      openIssues: 8,
      openPulls: 2,
      issuesClosed: 3,
      pullsMerged: 4,
      lastActivity: "2026-11-06T09:00:00.000Z",
      languages: [],
      ci: { runs: 4, successRate: 0.75 },
      activity: [],
      health: { score: 70, status: "watch", reasons: ["CI fails on the default branch"] },
    },
  ],
  failedRepos: [{ repo: "old", message: "Forgejo returned HTTP 404" }],
  incomplete: [],
}

describe("insightsSummary", () => {
  it("summarizes the headline numbers, attention, and health, riskiest first", () => {
    expect(insightsSummary(insights)).toBe(`# acme insights

2 repositories, last 30 days (Oct 8 to Nov 7, Europe/Amsterdam).

## Headline numbers

- **Open issues:** 12 (+3 since Oct 8)
- **Open pull requests:** 3 (-1 since Oct 8)
- **Issues opened:** 8 (previous 30 days: 5)
- **Issues closed:** 5 (previous 30 days: 6)
- **Pull requests merged:** 7 (previous 30 days: 2)
- **Median time to close an issue:** 30h
- **CI success rate:** 75% (previous 30 days: 50%)

## Needs attention

- CI failing in api: [ci on main](https://forgejo.example/acme/api/actions/runs/9), The latest run failed (1d)

## Repository health

- **api** 70 (watch): CI fails on the default branch
- **web** 100 (strong)

Not included, because they failed to load: old.
`)
  })
})

describe("insightsSummary with listings read in part", () => {
  it("says which listings Tabulo did not read to the end", () => {
    const summary = insightsSummary({
      ...insights,
      incomplete: [
        { repo: "api", listing: "runs" },
        { repo: "web", listing: "closed" },
      ],
    })

    expect(summary.trimEnd().split("\n").at(-1)).toBe(
      "Tabulo reached its limit of Forgejo requests and read only part of the CI runs of api, closed issues and pull requests of web. Numbers that count them are too low.",
    )
  })
})

describe("chart scale", () => {
  it("picks round ticks that cover the maximum", () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(3, 4)).toEqual([0, 1, 2, 3])
    expect(niceTicks(184, 3)).toEqual([0, 50, 100, 150, 200])
    expect(niceTicks(61, 3)).toEqual([0, 20, 40, 60, 80])
  })

  it("formats durations in the unit that reads best", () => {
    expect(formatHours(0.5)).toBe("30m")
    expect(formatHours(14.3)).toBe("14.3h")
    expect(formatHours(105.2)).toBe("4.4d")
  })
})
