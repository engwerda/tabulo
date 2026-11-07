import { describe, expect, it } from "vitest"
import { columnCards } from "../src/client/board/board-view.ts"
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
  author: { login: "ada", avatarUrl: "" },
  comments: 0,
  createdAt: "2026-10-01T00:00:00Z",
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
})
