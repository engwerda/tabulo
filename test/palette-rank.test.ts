import { describe, expect, it } from "vitest"
import { type GroupSpec, rankSections } from "../src/client/palette/rank.ts"

type Item = { id: string; title: string; subtitle?: string; keywords?: string }

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

  it("limits each group", () => {
    const many = group(
      "repositories",
      Array.from({ length: 12 }, (_, index) => ({ id: `repo:${index}`, title: `repo ${index}` })),
      { limit: 4 },
    )
    expect(rankSections("repo", [many], [])[0]?.rows).toHaveLength(4)
  })
})
