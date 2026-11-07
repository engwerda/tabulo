import { describe, expect, it } from "vitest"
import {
  completion,
  epicSummary,
  readEpicFilters,
  visibleEpics,
} from "../src/client/epics/epics-view.ts"
import type { Epic } from "../src/shared/api.ts"

const epic = (number: number, total: number, done: number, fields: Partial<Epic> = {}): Epic => ({
  key: `acme/api#${number}`,
  repo: "api",
  number,
  title: `Epic ${number}`,
  url: "",
  state: "open",
  assignees: [],
  milestone: null,
  labels: [],
  updatedAt: "2026-11-01T00:00:00Z",
  column: "todo",
  progress: { total, done, byColumn: {} },
  children: [],
  ...fields,
})
const items = [
  epic(1, 10, 4, { title: "Ship search", assignees: [{ login: "ada", avatarUrl: "" }] }),
  epic(2, 2, 2, { state: "closed", updatedAt: "2026-11-06T00:00:00Z" }),
  epic(3, 0, 0, { updatedAt: "2026-11-05T00:00:00Z" }),
  epic(4, 8, 0, { title: "Improve search", assignees: [{ login: "grace", avatarUrl: "" }] }),
]
const keys = (params: string) =>
  visibleEpics(items, new URLSearchParams(params)).map(({ number }) => number)

describe("epics view", () => {
  it("combines text, state, and epic assignee filters", () => {
    expect(keys("q=SEARCH&state=open&assignee=ada")).toEqual([1])
    expect(keys("q=api%232")).toEqual([2])
    expect(keys("state=closed")).toEqual([2])
    expect(keys("assignee=unknown")).toEqual([])
  })
  it("ignores invalid state and sort values from bookmarks", () => {
    expect(readEpicFilters(new URLSearchParams("state=deleted&sort=unknown"))).toMatchObject({
      state: "",
      sort: "updated",
    })
    expect(keys("state=deleted&sort=unknown")).toEqual([2, 3, 1, 4])
  })
  it("sorts by actual completion ratio and puts empty epics at zero", () => {
    expect(keys("sort=progress")).toEqual([2, 1, 3, 4])
    const close = [epic(1, 300, 100), epic(2, 301, 101)]
    expect(visibleEpics(close, new URLSearchParams("sort=progress"))[0]?.number).toBe(2)
  })
  it("sorts by child count without mutating the response", () => {
    expect(keys("sort=children")).toEqual([1, 4, 2, 3])
    expect(items.map(({ number }) => number)).toEqual([1, 2, 3, 4])
  })
  it("summarizes children rather than averaging epic percentages, and counts open epics with children but none done as at risk", () => {
    expect(epicSummary(items)).toEqual({ total: 20, done: 6, percent: 30, atRisk: 1 })
    expect(epicSummary([])).toEqual({ total: 0, done: 0, percent: 0, atRisk: 0 })
  })
  it("handles empty progress without dividing by zero", () => {
    expect(completion({ total: 0, done: 0 })).toBe(0)
    expect(completion({ total: 3, done: 1 })).toBe(33)
  })
})
