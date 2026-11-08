import { describe, expect, it } from "vitest"
import { fuzzyMatch, fuzzyMatchFields } from "../src/client/palette/fuzzy.ts"

const score = (query: string, text: string) => fuzzyMatch(query, text)?.score ?? Number.NaN

describe("fuzzyMatch", () => {
  it("matches an empty query against anything, with nothing to highlight", () => {
    expect(fuzzyMatch("", "Dashboard")).toEqual({ score: 0, quality: 0, indices: [] })
    expect(fuzzyMatch("  ", "Dashboard")).toEqual({ score: 0, quality: 0, indices: [] })
  })

  it("matches a subsequence, ignoring case, and reports the matched characters", () => {
    expect(fuzzyMatch("dsh", "Dashboard")?.indices).toEqual([0, 2, 3])
    expect(fuzzyMatch("DASH", "dashboard")?.indices).toEqual([0, 1, 2, 3])
  })

  it("rejects a query that is not a subsequence, or longer than the text", () => {
    expect(fuzzyMatch("hsd", "Dashboard")).toBeNull()
    expect(fuzzyMatch("dashboards", "Dashboard")).toBeNull()
  })

  it("ranks a prefix above a word start above a match in the middle", () => {
    const prefix = score("bo", "Board")
    const wordStart = score("bo", "Go to Board")
    const middle = score("bo", "Dashboard")
    expect(prefix).toBeGreaterThan(wordStart)
    expect(wordStart).toBeGreaterThan(middle)
  })

  it("ranks adjacent characters above scattered ones", () => {
    expect(score("rev", "Review requests")).toBeGreaterThan(score("rev", "Reset every view"))
  })

  it("prefers the placement that starts a word", () => {
    expect(fuzzyMatch("api", "a pretty api")?.indices).toEqual([9, 10, 11])
    expect(fuzzyMatch("ac", "acme/api")?.indices).toEqual([0, 1])
  })

  it("treats a camelCase hump and a path separator as a word start", () => {
    expect(fuzzyMatch("rl", "rateLimit")?.indices).toEqual([0, 4])
    expect(fuzzyMatch("ca", "acme/cab")?.indices).toEqual([5, 6])
  })

  it("rejects scattered letters inside words once a term has three characters", () => {
    expect(fuzzyMatch("cache", "Add rate limiting to the public search endpoint")).toBeNull()
    expect(fuzzyMatch("rate", "Cache organization labels for a minute")).toBeNull()
    expect(fuzzyMatch("brd", "Show keyboard shortcuts")).toBeNull()
    expect(fuzzyMatch("cache", "Cache organization labels")?.indices).toEqual([0, 1, 2, 3, 4])
  })

  it("keeps runs of two or more and word starts in a term of three characters", () => {
    expect(fuzzyMatch("dsh", "Dashboard")?.indices).toEqual([0, 2, 3])
    expect(fuzzyMatch("rlw", "Rate limit the webhook")?.indices).toEqual([0, 5, 15])
    expect(fuzzyMatch("brd", "Go to Board")?.indices).toEqual([6, 9, 10])
  })

  it("finds the sound placement when the best-scoring letters would be scattered", () => {
    expect(fuzzyMatch("abc", "Abxc zbc")?.indices).toEqual([0, 6, 7])
  })

  it("still matches scattered letters in a term of one or two characters", () => {
    expect(fuzzyMatch("ce", "public search")?.indices).toEqual([5, 8])
  })

  it("requires every space-separated term, in any order", () => {
    expect(fuzzyMatch("limit rate", "Rate limit the webhook")?.indices).toEqual([
      0, 1, 2, 3, 5, 6, 7, 8, 9,
    ])
    expect(fuzzyMatch("rate zebra", "Rate limit")).toBeNull()
  })
})

describe("fuzzyMatchFields", () => {
  it("fits each term to the field it matches best", () => {
    const match = fuzzyMatchFields("acme board", ["Board", "acme", "go open"])
    expect(match?.indices).toEqual([[0, 1, 2, 3, 4], [0, 1, 2, 3], []])
  })

  it("rejects the match when a term fits no field", () => {
    expect(fuzzyMatchFields("board zebra", ["Board", "acme"])).toBeNull()
  })

  it("scores a title match above the same match in a later field", () => {
    const inTitle = fuzzyMatchFields("api", ["api", "web"])?.score ?? 0
    const inSubtitle = fuzzyMatchFields("api", ["web", "api"])?.score ?? 0
    expect(inTitle).toBeGreaterThan(inSubtitle)
  })
})

describe("hidden keywords", () => {
  it("match only where a keyword begins, so they never explain a match nobody can see", () => {
    expect(
      fuzzyMatchFields("rate", ["Refresh the board", "", "reload update"], { hiddenLast: true }),
    ).toBeNull()
    expect(
      fuzzyMatchFields("upd", ["Refresh the board", "", "reload update"], { hiddenLast: true }),
    ).not.toBeNull()
  })
})
