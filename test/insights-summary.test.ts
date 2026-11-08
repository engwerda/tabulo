import { describe, expect, it } from "vitest"
import {
  formatChange,
  formatHours,
  formatSpan,
  labelStride,
  niceTicks,
} from "../src/client/charts/scale.ts"
import { formatWindowStart, insightsSummary, priorLabel } from "../src/client/insights/summary.ts"
import type { Insights } from "../src/shared/api.ts"

const insights: Insights = {
  org: "acme",
  repos: ["api", "web", "old"],
  days: 30,
  tz: "Europe/Amsterdam",
  generatedAt: "2026-11-07T09:00:00.000Z",
  window: { start: "2026-10-05", end: "2026-11-07" },
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
    expect(insightsSummary(insights, "Acme Corporation")).toBe(`# Acme Corporation insights

2 repositories, last 30 days in whole weeks (Oct 5 to Nov 7, 2026, Europe/Amsterdam).

## Headline numbers

- **Open issues:** 12 (+3 since Oct 5)
- **Open pull requests:** 3 (-1 since Oct 5)
- **Issues opened:** 8 (period before: 5)
- **Issues closed:** 5 (period before: 6)
- **Pull requests merged:** 7 (period before: 2)
- **Median time to close an issue:** 30h
- **CI success rate:** 75% (period before: 50%)

## Needs attention

- CI failing in api: [ci on main](https://forgejo.example/acme/api/actions/runs/9), The latest run failed (1d)

## Repository health

- **api** 70 (watch): CI fails on the default branch
- **web** 100 (strong)

Not included, because they failed to load: old.
`)
  })
})

describe("insightsSummary across a new year", () => {
  it("dates the changes since a start in an earlier year with that year", () => {
    const summary = insightsSummary(
      { ...insights, days: 365, window: { start: "2025-11-03", end: "2026-11-08" } },
      "acme",
    )

    expect(summary).toContain("(Nov 3, 2025 to Nov 8, 2026, Europe/Amsterdam)")
    expect(summary).toContain("- **Open issues:** 12 (+3 since Nov 3, 2025)")
    expect(summary).toContain("- **Open pull requests:** 3 (-1 since Nov 3, 2025)")
  })
})

describe("formatWindowStart", () => {
  it("names the start's year only when the window ends in a later year", () => {
    expect(formatWindowStart({ start: "2026-10-05", end: "2026-11-07" })).toBe("Oct 5")
    expect(formatWindowStart({ start: "2025-11-03", end: "2026-11-08" })).toBe("Nov 3, 2025")
  })
})

describe("insightsSummary with listings read in part", () => {
  it("says which listings Tabulo did not read to the end", () => {
    const summary = insightsSummary(
      {
        ...insights,
        incomplete: [
          { repo: "api", listing: "runs" },
          { repo: "web", listing: "closed" },
        ],
      },
      "acme",
    )

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

  it("spaces axis labels further apart only where long neighbours would touch", () => {
    const weeks = Array.from({ length: 53 }, () => "Jun 15")
    expect(labelStride(weeks, 680, 52)).toBe(5)
    const withYears = weeks.map((label, index) => (index < 13 ? "Dec 29 ’25" : label))
    expect(labelStride(withYears, 680, 52)).toBe(6)
    expect(labelStride(["Jan 5 ’26", "Mar 2"], 0, 52)).toBe(2)
  })

  it("formats durations in the unit that reads best", () => {
    expect(formatHours(0.5)).toBe("30m")
    expect(formatHours(14.3)).toBe("14.3h")
    expect(formatHours(105.2)).toBe("4.4d")
  })

  it("names the year of a span of days once, or at both ends across a new year", () => {
    expect(formatSpan("2026-10-05", "2026-11-07")).toBe("Oct 5 to Nov 7, 2026")
    expect(formatSpan("2025-11-03", "2026-11-07")).toBe("Nov 3, 2025 to Nov 7, 2026")
  })

  it("shows a change as a percentage only from an earlier value of 10, else names that value", () => {
    expect(formatChange(81, 3, "percent")).toBe("+78 from 3")
    expect(formatChange(107, 7, "percent")).toBe("+100 from 7")
    expect(formatChange(5, 0, "percent")).toBe("+5 from 0")
    expect(formatChange(4, 9, "percent")).toBe("−5 from 9")
    expect(formatChange(15, 10, "percent")).toBe("+50%")
    expect(formatChange(30, 40, "percent")).toBe("−25%")
    expect(formatChange(30, 4, "absolute")).toBe("+26")
    expect(formatChange(8, 5, "percent", formatHours)).toBe("+3h from 5h")
    expect(formatChange(130, 80, "percent", formatHours)).toBe("+63%")
    expect(formatChange(0.88, 0.75, "points")).toBe("+13 pts")
    expect(formatChange(0.87, 0.88, "points")).toBe("−1 pt")
  })
})

describe("priorLabel", () => {
  it("names the window's length in weeks, which start on a Monday", () => {
    expect(priorLabel({ start: "2026-10-05", end: "2026-11-08" })).toBe("vs the 5 weeks before")
    expect(priorLabel({ start: "2025-11-03", end: "2026-11-08" })).toBe("vs the 53 weeks before")
    expect(priorLabel({ start: "2026-03-23", end: "2026-04-05" })).toBe("vs the 2 weeks before")
  })

  it("rounds a window that ends partway through its last week", () => {
    expect(priorLabel({ start: "2026-10-05", end: "2026-11-06" })).toBe("vs the 5 weeks before")
    expect(priorLabel({ start: "2026-10-05", end: "2026-11-04" })).toBe("vs the 4 weeks before")
  })
})
