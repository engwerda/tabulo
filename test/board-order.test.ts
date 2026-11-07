import { describe, expect, it } from "vitest"
import { columnCards, dropNeighbours } from "../src/client/board/board-view.ts"
import type { BoardCard } from "../src/shared/api.ts"

const card = (number: number, column: string, rank: string): BoardCard => ({
  key: `acme/api#${number}`,
  repo: "api",
  number,
  title: `Issue ${number}`,
  url: `https://forgejo.example/acme/api/issues/${number}`,
  state: "open",
  labels: [],
  assignees: [],
  milestone: null,
  updatedAt: "2026-11-01T00:00:00Z",
  closedAt: null,
  column,
  rank,
  readOnlyReason: null,
})

const keys = (numbers: ReadonlyArray<number>) => numbers.map((number) => `acme/api#${number}`)

describe("board column order", () => {
  it("orders by rank code units, then by key when ranks are equal", () => {
    // "Zz" is the key fractional-indexing generates before "a0", so it sorts first by code unit
    // although a locale-aware comparison puts it last.
    const cards = [
      card(1, "todo", "a0"),
      card(3, "todo", "a1"),
      card(2, "todo", "a1"),
      card(4, "todo", "Zz"),
      card(5, "done", "a0"),
    ]
    expect(columnCards(cards, "todo").map((c) => c.key)).toEqual(keys([4, 1, 2, 3]))
  })

  it("names the cards shown above and below a drop, leaving out the moved card", () => {
    const shown = keys([1, 2, 3])
    expect(dropNeighbours(shown, "acme/api#1", 1)).toEqual({
      afterKey: "acme/api#2",
      beforeKey: "acme/api#3",
    })
    expect(dropNeighbours(shown, "acme/api#9", 0)).toEqual({
      afterKey: null,
      beforeKey: "acme/api#1",
    })
    expect(dropNeighbours(shown, "acme/api#9", 3)).toEqual({
      afterKey: "acme/api#3",
      beforeKey: null,
    })
  })
})
