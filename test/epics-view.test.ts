import { describe, expect, it } from "vitest"
import {
  backlinksRead,
  boardCardHref,
  childRef,
  completion,
  type EpicIssue,
  epicPreviewHome,
  epicPreviewMiss,
  epicRef,
  epicSummary,
  findEpicPreview,
  incompleteNotice,
  readEpicFilters,
  readOpenEpics,
  visibleEpics,
  withEpicOpen,
} from "../src/client/epics/epics-view.ts"
import { issueRef } from "../src/client/issue/preview.ts"
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

describe("epic preview", () => {
  const child = (repo: string, number: number, fields: Partial<EpicIssue> = {}): EpicIssue => ({
    _tag: "Issue",
    key: `${repo}#${number}`.toLowerCase(),
    repo,
    number,
    title: `Child ${number}`,
    url: `https://forgejo.example/${repo}/issues/${number}`,
    state: "open",
    kind: "issue",
    column: "todo",
    assignees: [],
    ...fields,
  })
  const response = (epics: ReadonlyArray<Epic>, fields: Partial<Epics> = {}): Epics => ({
    org: "acme",
    repos: ["api", "web"],
    columns: [],
    epics,
    failedRepos: [],
    incomplete: { listings: [], children: 0, backlinks: [] },
    ...fields,
  })

  it("finds an epic of the organization without regard to case", () => {
    const search = epic(1, 0, 0, {
      title: "Ship search",
      url: "https://forgejo.example/acme/api/issues/1",
      state: "closed",
    })
    const preview = findEpicPreview(response([search]), "ACME/Api#1")

    expect(preview).toEqual({
      issue: {
        key: "acme/api#1",
        owner: "acme",
        repo: "api",
        number: 1,
        kind: "issue",
        title: "Ship search",
        url: "https://forgejo.example/acme/api/issues/1",
        closed: true,
      },
      item: { _tag: "Epic", epic: search, backlinksRead: true },
      parents: [],
    })
  })

  it("finds a child in another organization by its repository's full name", () => {
    const outside = child("partner/sdk", 4, { title: "Publish the SDK" })
    const preview = findEpicPreview(
      response([epic(1, 1, 0, { children: [outside] })]),
      "partner/sdk#4",
    )

    expect(preview?.issue).toEqual({
      key: "partner/sdk#4",
      owner: "partner",
      repo: "sdk",
      number: 4,
      kind: "issue",
      title: "Publish the SDK",
      url: "https://forgejo.example/partner/sdk/issues/4",
      closed: false,
    })
    expect(preview?.item).toEqual({ _tag: "Child", child: outside })
  })

  it("finds a child by its repository's current name, not the reference the epic wrote", () => {
    const renamed = child("acme/frontend", 9, { key: "acme/web#9" })
    const data = response([epic(1, 1, 0, { children: [renamed] })])

    expect(findEpicPreview(data, "acme/frontend#9")?.item).toEqual({
      _tag: "Child",
      child: renamed,
    })
    expect(findEpicPreview(data, "acme/web#9")).toBeUndefined()
  })

  it("previews a pull request child as a pull request and a closed child as closed", () => {
    const pull = child("acme/api", 7, { kind: "pull", state: "closed" })
    const preview = findEpicPreview(response([epic(1, 1, 1, { children: [pull] })]), "acme/api#7")

    expect(preview?.issue).toMatchObject({ kind: "pull", closed: true })
  })

  it("prefers the epic when another epic lists it as a child, and names that epic as its parent", () => {
    const sub = epic(2, 0, 0, { title: "Sub-epic" })
    const parent = epic(1, 1, 0, { children: [child("acme/api", 2, { title: "Listed" })] })
    const preview = findEpicPreview(response([parent, sub]), "acme/api#2")

    expect(preview?.item).toEqual({ _tag: "Epic", epic: sub, backlinksRead: true })
    expect(preview?.issue.title).toBe("Sub-epic")
    expect(preview?.parents).toEqual([parent])
  })

  it("lists every epic that lists the item, in the page's order, once each and never itself", () => {
    const shared = child("acme/web", 5)
    const first = epic(1, 1, 0, { children: [shared] })
    const unrelated = epic(2, 1, 0, { children: [child("acme/web", 6)] })
    const second = epic(3, 2, 0, { children: [child("acme/web", 8), shared] })
    const own = epic(4, 1, 0, { children: [child("acme/api", 4)] })

    expect(findEpicPreview(response([first, unrelated, second]), "acme/web#5")?.parents).toEqual([
      first,
      second,
    ])
    expect(findEpicPreview(response([own]), "acme/api#4")?.parents).toEqual([])
  })

  it("does not preview an unavailable child or a reference nothing lists", () => {
    const data = response([
      epic(1, 1, 0, { children: [{ _tag: "Unavailable", ref: "acme/web#5" }] }),
    ])

    expect(findEpicPreview(data, "acme/web#5")).toBeUndefined()
    expect(findEpicPreview(data, "acme/api#2")).toBeUndefined()
    expect(findEpicPreview(data, "acme/api")).toBeUndefined()
  })

  it("finds what a row writes into the address, under the same reference", () => {
    const listed = child("partner/sdk", 4)
    const parent = epic(1, 1, 0, { children: [listed] })
    const data = response([parent])
    const shownRef = (ref: string) => {
      const preview = findEpicPreview(data, ref)
      return preview === undefined ? undefined : issueRef(preview.issue)
    }

    expect(shownRef(epicRef(data.org, parent))).toBe("acme/api#1")
    expect(shownRef(childRef(listed))).toBe("partner/sdk#4")
  })

  it("says when Tabulo did not read every issue that links to the epic", () => {
    const data = response([epic(1, 0, 0)], {
      incomplete: { listings: [], children: 0, backlinks: [{ repo: "api", number: 1 }] },
    })

    expect(findEpicPreview(data, "acme/api#1")?.item).toMatchObject({ backlinksRead: false })
  })

  it("keeps an address it does not list while a repository failed to load", () => {
    const data = response([], { failedRepos: [{ repo: "web", message: "HTTP 500" }] })

    expect(epicPreviewMiss(data, "acme/web#5")).toBeNull()
  })

  it("closes an address it does not list with the likeliest reason", () => {
    const unavailable = response([
      epic(1, 1, 0, { children: [{ _tag: "Unavailable", ref: "acme/web#5" }] }),
    ])
    const partly = response([], {
      incomplete: { listings: [{ repo: "web", listing: "open" }], children: 0, backlinks: [] },
    })

    expect(epicPreviewMiss(unavailable, "ACME/web#5")).toEqual({
      title: "ACME/web#5 is not among these epics",
      detail: "It is not available to you, or not found in Forgejo.",
    })
    expect(epicPreviewMiss(partly, "acme/web#5")?.detail).toBe(
      "Tabulo read only part of these repositories, so it may be missing.",
    )
    expect(epicPreviewMiss(response([]), "acme/web#5")?.detail).toBe(
      "It is not an epic or a child of one in the chosen repositories.",
    )
  })

  it("belongs to the epic itself, or to a child's first parent, when no row opened it", () => {
    const shared = child("acme/web", 5)
    const first = epic(1, 1, 0, { children: [shared] })
    const second = epic(3, 1, 0, { children: [shared] })
    const data = response([first, second])
    const home = (ref: string) => {
      const preview = findEpicPreview(data, ref)
      return preview === undefined ? undefined : epicPreviewHome(preview)
    }

    expect(home("acme/api#3")).toBe("acme/api#3")
    expect(home("acme/web#5")).toBe("acme/api#1")
  })
})
