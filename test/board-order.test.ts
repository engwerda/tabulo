import { describe, expect, it } from "vitest"
import { columnCards, orderAfterMove } from "../src/client/board/board-view.ts"
import type { Board, BoardCard } from "../src/shared/api.ts"

const card = (
  number: number,
  column: string,
  rank: string | null,
  updatedAt: string,
): BoardCard => ({
  key: `acme/api#${number}`,
  repo: "api",
  number,
  title: `Issue ${number}`,
  url: `https://forgejo.example/acme/api/issues/${number}`,
  state: "open",
  labels: [],
  assignees: [],
  milestone: null,
  updatedAt,
  closedAt: null,
  column,
  rank,
  canWrite: true,
})

// "Zz" is the key fractional-indexing generates before "a0", so it sorts first by code unit
// although a locale-aware comparison puts it last.
const cards = [
  card(1, "todo", "a0", "2026-11-01T00:00:00Z"),
  card(2, "todo", "Zz", "2026-11-01T00:00:00Z"),
  card(3, "todo", null, "2026-11-05T00:00:00Z"),
  card(4, "todo", null, "2026-11-06T00:00:00Z"),
  card(5, "done", null, "2026-11-06T00:00:00Z"),
]
const board: Board = { org: "acme", repos: ["api"], columns: [], cards, failedRepos: [] }
const keys = (numbers: ReadonlyArray<number>) => numbers.map((number) => `acme/api#${number}`)

describe("board column order", () => {
  it("puts ranked cards first by rank code units, then unranked cards newest first", () => {
    expect(columnCards(cards, "todo").map((c) => c.key)).toEqual(keys([2, 1, 4, 3]))
  })

  it("inserts a card from another column at the drop position among all cards", () => {
    expect(orderAfterMove(board, { key: "acme/api#5", toColumn: "todo", index: 1 })).toEqual(
      keys([2, 5, 1, 4, 3]),
    )
  })

  it("moves a card within its column without duplicating it", () => {
    expect(orderAfterMove(board, { key: "acme/api#3", toColumn: "todo", index: 0 })).toEqual(
      keys([3, 2, 1, 4]),
    )
  })
})
