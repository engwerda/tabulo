import { describe, expect, it } from "vitest"
import { fuzzyMatch } from "../src/client/palette/fuzzy.ts"

const score = (query: string, text: string) => fuzzyMatch(query, text)?.score ?? Number.NaN

describe("fuzzyMatch", () => {
  it("matches an empty query against anything, with nothing to highlight", () => {
    expect(fuzzyMatch("", "Dashboard")).toEqual({ score: 0, indices: [] })
    expect(fuzzyMatch("  ", "Dashboard")).toEqual({ score: 0, indices: [] })
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

  it("requires every space-separated term, in any order", () => {
    expect(fuzzyMatch("limit rate", "Rate limit the webhook")?.indices).toEqual([
      0, 1, 2, 3, 5, 6, 7, 8, 9,
    ])
    expect(fuzzyMatch("rate zebra", "Rate limit")).toBeNull()
  })
})
