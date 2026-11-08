import { describe, expect, it } from "vitest"
import { type GroupSpec, rankSections } from "../src/client/palette/rank.ts"

type Item = { id: string; title: string; subtitle?: string; keywords?: string; sameAs?: string }

const group = (
  id: string,
  items: ReadonlyArray<Item>,
  overrides: Partial<GroupSpec<Item>> = {},
): GroupSpec<Item> => ({
  id,
  heading: id,
  items,
  limit: 8,
  emptyLimit: 3,
  filter: true,
  ...overrides,
})

const navigation = group("navigation", [
  { id: "nav:dashboard", title: "Dashboard" },
  { id: "nav:board", title: "Board", subtitle: "acme" },
  { id: "nav:epics", title: "Epics", subtitle: "acme" },
])
const actions = group("actions", [
  { id: "action:dark", title: "Theme: Dark", keywords: "appearance" },
  { id: "action:signout", title: "Sign out" },
])

const ids = (sections: ReturnType<typeof rankSections<Item>>) =>
  sections.map((section) => [section.id, section.rows.map((row) => row.item.id)])

describe("rankSections", () => {
  it("shows recent items first, once, then each group up to its empty limit", () => {
    const sections = rankSections(
      "",
      [navigation, actions],
      ["action:signout", "gone", "nav:board"],
    )

    expect(ids(sections)).toEqual([
      ["recent", ["action:signout", "nav:board"]],
      ["navigation", ["nav:dashboard", "nav:epics"]],
      ["actions", ["action:dark"]],
    ])
  })

  it("shows the page's own commands before the recent items, and ranks them like any group", () => {
    const board = group(
      "board",
      [
        { id: "board:new", title: "New issue" },
        { id: "board:refresh", title: "Refresh the board" },
      ],
      { contextual: true },
    )
    const groups = [navigation, actions, board]

    expect(ids(rankSections("", groups, ["action:signout"]))).toEqual([
      ["board", ["board:new", "board:refresh"]],
      ["recent", ["action:signout"]],
      ["navigation", ["nav:dashboard", "nav:board", "nav:epics"]],
      ["actions", ["action:dark"]],
    ])
    expect(ids(rankSections("sign", groups, []))).toEqual([["actions", ["action:signout"]]])
    expect(ids(rankSections("board", groups, [])).map(([id]) => id)).toEqual([
      "navigation",
      "board",
    ])
  })

  it("hides a group whose empty limit is 0 and skips unfiltered groups", () => {
    const sections = rankSections(
      "",
      [
        navigation,
        group("issues", [{ id: "issue:1", title: "x" }], { emptyLimit: 0, filter: false }),
      ],
      [],
    )
    expect(sections.map((section) => section.id)).toEqual(["navigation"])
  })

  it("keeps only matches, best first, with the matched characters", () => {
    const [section] = rankSections("ep", [navigation], [])

    expect(section?.rows.map((row) => row.item.id)).toEqual(["nav:epics"])
    expect(section?.rows[0]?.titleIndices).toEqual([0, 1])
  })

  it("puts the group with the best match first", () => {
    const sections = rankSections("sign", [navigation, actions], [])
    expect(ids(sections)).toEqual([["actions", ["action:signout"]]])

    const both = rankSections("d", [navigation, actions], [])
    expect(both[0]?.id).toBe("navigation")
  })

  it("puts the page's own commands before a group that matches as well, but not better", () => {
    const board = group("board", [{ id: "board:by-label", title: "Filter by label…" }], {
      contextual: true,
    })
    const labels = group("board:labels", [
      { id: "board:label:none", title: "No label" },
      { id: "board:label:bug", title: "bug" },
    ])

    expect(ids(rankSections("lab", [labels, board], [])).map(([id]) => id)).toEqual([
      "board",
      "board:labels",
    ])
    expect(ids(rankSections("bug", [labels, board], []))).toEqual([
      ["board:labels", ["board:label:bug"]],
    ])
    const labelled = group("board:labels", [{ id: "board:label:lab", title: "lab" }])
    expect(ids(rankSections("lab", [board, labelled], [])).map(([id]) => id)).toEqual([
      "board:labels",
      "board",
    ])
  })

  it("matches the subtitle and keywords", () => {
    expect(ids(rankSections("acme board", [navigation], []))).toEqual([
      ["navigation", ["nav:board"]],
    ])
    expect(ids(rankSections("appearance", [actions], []))).toEqual([["actions", ["action:dark"]]])
  })

  it("keeps every server result, after the local groups, even when none is loaded yet", () => {
    const issues = group("issues", [{ id: "issue:1", title: "Rate limit the webhook" }], {
      filter: false,
    })
    const waiting = group("issues", [], { filter: false })

    expect(ids(rankSections("zzz", [navigation, issues], []))).toEqual([["issues", ["issue:1"]]])
    expect(ids(rankSections("ep", [issues, navigation], []))).toEqual([
      ["navigation", ["nav:epics"]],
      ["issues", ["issue:1"]],
    ])
    expect(ids(rankSections("ep", [navigation, waiting], []))).toEqual([
      ["navigation", ["nav:epics"]],
      ["issues", []],
    ])
  })

  it("leaves out a server result that repeats a row shown above, and only then", () => {
    const work = group("work", [
      { id: "work:1", title: "Public API docs" },
      { id: "work:2", title: "Rotate keys" },
    ])
    const issues = group(
      "issues",
      [
        { id: "issue:1", title: "Public API docs", sameAs: "work:1" },
        { id: "issue:2", title: "Rotate keys", sameAs: "work:2" },
        { id: "issue:3", title: "Public status page" },
      ],
      { filter: false, limit: 2 },
    )

    expect(ids(rankSections("public", [work, issues], []))).toEqual([
      ["work", ["work:1"]],
      ["issues", ["issue:2", "issue:3"]],
    ])
  })

  it("leaves out an item whose only match is scattered letters", () => {
    const work = group("work", [
      { id: "work:cache", title: "Cache organization labels", subtitle: "acme/api#78" },
      { id: "work:rate", title: "Add rate limiting to the public search endpoint" },
    ])
    expect(ids(rankSections("cache", [work], []))).toEqual([["work", ["work:cache"]]])
  })

  it("highlights nothing in a server result whose text has only scattered letters", () => {
    const issues = group(
      "issues",
      [{ id: "issue:1", title: "Add rate limiting to the public search endpoint" }],
      { filter: false },
    )
    const [section] = rankSections("cache", [issues], [])
    expect(section?.rows[0]?.titleIndices).toEqual([])
  })

  it("limits each group", () => {
    const many = group(
      "repositories",
      Array.from({ length: 12 }, (_, index) => ({ id: `repo:${index}`, title: `repo ${index}` })),
      { limit: 4 },
    )
    expect(rankSections("repo", [many], [])[0]?.rows).toHaveLength(4)
  })
})
