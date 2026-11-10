import { describe, expect, it } from "vitest"
import {
  backlinksRead,
  boardCardHref,
  completion,
  epicSummary,
  incompleteNotice,
  readEpicFilters,
  readOpenEpics,
  visibleEpics,
  withEpicOpen,
} from "../src/client/epics/epics-view.ts"
import type { Epic, Epics } from "../src/shared/api.ts"

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
  it("says which listings and how many children Tabulo did not read", () => {
    expect(incompleteNotice({ listings: [], children: 0, backlinks: [] })).toBe("")
    expect(
      incompleteNotice({
        listings: [
          { repo: "api", listing: "open" },
          { repo: "web", listing: "closed" },
        ],
        children: 0,
        backlinks: [],
      }),
    ).toBe(
      "Tabulo reached its limit of Forgejo requests and read only part of the open issues of api, recently closed issues of web, so some epics may be missing.",
    )
    expect(incompleteNotice({ listings: [], children: 1, backlinks: [] })).toBe(
      "Tabulo reached its limit of Forgejo requests and did not look up 1 child, which shows as unavailable.",
    )
    expect(
      incompleteNotice({
        listings: [{ repo: "api", listing: "open" }],
        children: 3,
        backlinks: [],
      }),
    ).toBe(
      "Tabulo reached its limit of Forgejo requests and read only part of the open issues of api, so some epics may be missing. It did not look up 3 children, which show as unavailable.",
    )
  })
  it("says which epics' linking issues Tabulo did not read", () => {
    const unread = (...numbers: Array<number>) => numbers.map((number) => ({ repo: "api", number }))
    const notice = (backlinks: Epics["incomplete"]["backlinks"]) =>
      incompleteNotice({ listings: [], children: 0, backlinks })
    expect(notice(unread(1813))).toBe(
      "Tabulo did not read every issue that links to api#1813, so some of its children may be missing.",
    )
    expect(notice([...unread(1813), { repo: "web", number: 4 }])).toBe(
      "Tabulo did not read every issue that links to api#1813, web#4, so some of their children may be missing.",
    )
    expect(notice(unread(1, 2, 3, 4, 5, 6))).toBe(
      "Tabulo did not read every issue that links to api#1, api#2, api#3, api#4, api#5 and 1 other epic, so some of their children may be missing.",
    )
    expect(notice(unread(1, 2, 3, 4, 5, 6, 7, 8))).toBe(
      "Tabulo did not read every issue that links to api#1, api#2, api#3, api#4, api#5 and 3 other epics, so some of their children may be missing.",
    )
    expect(
      incompleteNotice({
        listings: [{ repo: "api", listing: "open" }],
        children: 3,
        backlinks: unread(1),
      }),
    ).toBe(
      "Tabulo reached its limit of Forgejo requests and read only part of the open issues of api, so some epics may be missing. It did not look up 3 children, which show as unavailable. Tabulo did not read every issue that links to api#1, so some of its children may be missing.",
    )
    expect(incompleteNotice({ listings: [], children: 1, backlinks: unread(1) })).toBe(
      "Tabulo reached its limit of Forgejo requests and did not look up 1 child, which shows as unavailable. Tabulo did not read every issue that links to api#1, so some of its children may be missing.",
    )
  })
  it("flags only the epic whose linking issues Tabulo did not read", () => {
    const incomplete = { listings: [], children: 0, backlinks: [{ repo: "api", number: 1 }] }
    expect(backlinksRead(incomplete, { repo: "api", number: 1 })).toBe(false)
    expect(backlinksRead(incomplete, { repo: "web", number: 1 })).toBe(true)
    expect(backlinksRead(incomplete, { repo: "api", number: 2 })).toBe(true)
  })
  it("handles empty progress without dividing by zero", () => {
    expect(completion({ total: 0, done: 0 })).toBe(0)
    expect(completion({ total: 3, done: 1 })).toBe(33)
  })
})

describe("boardCardHref", () => {
  const card = (href: string | null) => {
    if (href === null) return null
    const url = new URL(href, "https://tabulo.example")
    return { path: url.pathname, query: [...url.searchParams] }
  }

  const design = { id: "k3x9q2m7", repos: ["Web", "docs"] }
  const everything = { id: "default", repos: ["api", "web", "docs"] }

  it("opens an open issue in the panel of a board that shows its repository", () => {
    const open = { repo: "acme/Web", number: 12, state: "open", kind: "issue" } as const
    expect(card(boardCardHref("Acme", design, open))).toEqual({
      path: "/board/Acme/k3x9q2m7",
      query: [["card", "Web#12"]],
    })
    expect(
      card(boardCardHref("acme", everything, { repo: "API", number: 3, state: "open" })),
    ).toEqual({ path: "/board/acme", query: [["card", "API#3"]] })
  })

  it("links to Forgejo when the board does not show the repository or is not loaded", () => {
    const issue = { repo: "acme/api", number: 12, state: "open", kind: "issue" } as const
    expect(boardCardHref("acme", design, issue)).toBeNull()
    expect(boardCardHref("acme", undefined, issue)).toBeNull()
  })

  it("has no board address for what no board shows", () => {
    const issue = { repo: "acme/web", number: 12, state: "open", kind: "issue" } as const
    expect(boardCardHref("acme", everything, { ...issue, repo: "other/web" })).toBeNull()
    expect(boardCardHref("acme", everything, { ...issue, state: "closed" })).toBeNull()
    expect(boardCardHref("acme", everything, { ...issue, kind: "pull" })).toBeNull()
  })
})

describe("open epics in the address", () => {
  it("adds and removes an epic while keeping the other parameters", () => {
    const start = new URLSearchParams("repos=api,web&q=search")
    const one = withEpicOpen(start, "acme/api#1", true)
    const two = withEpicOpen(one, "acme/web#2", true)
    expect([...readOpenEpics(two)]).toEqual(["acme/api#1", "acme/web#2"])
    expect(two.get("repos")).toBe("api,web")
    expect(two.get("q")).toBe("search")
    expect([...readOpenEpics(withEpicOpen(two, "acme/api#1", false))]).toEqual(["acme/web#2"])
    expect(start.has("open")).toBe(false)
  })

  it("drops the parameter when no epic is open, and opens an epic once", () => {
    const one = withEpicOpen(new URLSearchParams(), "acme/api#1", true)
    expect(withEpicOpen(one, "acme/api#1", true).get("open")).toBe("acme/api#1")
    expect(withEpicOpen(one, "acme/api#1", false).has("open")).toBe(false)
    expect(readOpenEpics(new URLSearchParams("open=,")).size).toBe(0)
  })
})
