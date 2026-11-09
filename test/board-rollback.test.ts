import { describe, expect, it } from "vitest"
import { applySavedBoard } from "../src/client/board/board-settings.ts"
import { applyMove, replaceCard, revertMove } from "../src/client/board/board-view.ts"
import type { Board, BoardCard, BoardColumn } from "../src/shared/api.ts"

const TODO: BoardColumn = { _tag: "Todo", key: "todo", title: "Todo" }
const REVIEW: BoardColumn = {
  _tag: "Status",
  key: "Status/Review",
  title: "Review",
  label: { id: 2, name: "Status/Review", color: "8b5cf6" },
}
const DONE: BoardColumn = { _tag: "Done", key: "done", title: "Done" }
const NOW = "2026-11-09T12:00:00Z"

const card = (number: number, column: string, rank: string): BoardCard => ({
  key: `acme/api#${number}`,
  repo: "api",
  number,
  title: `Issue ${number}`,
  url: `https://forgejo.example/acme/api/issues/${number}`,
  state: column === "done" ? "closed" : "open",
  labels: [],
  assignees: [],
  milestone: null,
  author: { login: "ada", avatarUrl: "" },
  comments: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  closedAt: column === "done" ? "2026-11-08T00:00:00Z" : null,
  column,
  rank,
  readOnlyReason: null,
})

const loaded: Board = {
  org: "acme",
  board: {
    id: "k3x9q2m7",
    name: "Design",
    repos: ["api"],
    unreadableRepos: 0,
    columns: ["todo", "Status/Review", "done"],
    hidden: [],
    version: 4,
  },
  viewerCanArrange: true,
  columns: [TODO, REVIEW, DONE],
  allColumns: [TODO, REVIEW, DONE],
  cards: [
    card(1, "todo", "a0"),
    card(2, "todo", "a1"),
    card(3, "Status/Review", "a0"),
    card(4, "done", "a0"),
  ],
  failedRepos: [],
}

const find = (board: Board, number: number) =>
  board.cards.find((each) => each.number === number) as BoardCard
const original = (number: number) => find(loaded, number)
const move = (board: Board, number: number, toColumn: string) =>
  applyMove(board, { key: `acme/api#${number}`, toColumn, afterKey: null, beforeKey: null }, NOW)

describe("revertMove after a move failed", () => {
  it("puts the card back in its column and place", () => {
    const moved = move(loaded, 1, "Status/Review")
    expect(find(moved, 1).column).toBe("Status/Review")
    expect(revertMove(moved, original(1))).toEqual(loaded)
  })

  it("closes a card again whose move out of Done failed", () => {
    const moved = move(loaded, 4, "todo")
    expect(find(moved, 4)).toMatchObject({ state: "open", closedAt: null })
    expect(find(revertMove(moved, original(4)), 4)).toEqual(original(4))
  })

  it("keeps the settings saved after the move started", () => {
    const moved = move(loaded, 1, "Status/Review")
    const saved = applySavedBoard(
      moved,
      { ...loaded.board, name: "Product", columns: ["done", "todo", "Status/Review"], version: 5 },
      ["done", "todo", "Status/Review"],
    )
    const reverted = revertMove(saved, original(1))
    expect(reverted.board).toEqual(saved.board)
    expect(reverted.allColumns).toEqual([DONE, TODO, REVIEW])
    expect(find(reverted, 1)).toEqual(original(1))
  })

  it("keeps another card's move and what else changed on the card meanwhile", () => {
    const both = move(move(loaded, 1, "Status/Review"), 2, "done")
    const assigned = replaceCard(both, "acme/api#1", (each) => ({
      ...each,
      assignees: [{ login: "grace", avatarUrl: "" }],
    }))
    const reverted = revertMove(assigned, original(1))
    expect(find(reverted, 1)).toEqual({
      ...original(1),
      assignees: [{ login: "grace", avatarUrl: "" }],
    })
    expect(find(reverted, 2)).toEqual(find(both, 2))
  })

  it("leaves the card off when its column is now hidden, and off when it is gone", () => {
    const moved = move(loaded, 1, "Status/Review")
    const hidingTodo = applySavedBoard(moved, { ...loaded.board, hidden: ["todo"], version: 5 })
    expect(revertMove(hidingTodo, original(1)).cards.map((each) => each.number)).toEqual([3, 4])
    const gone = { ...moved, cards: moved.cards.filter((each) => each.number !== 1) }
    expect(revertMove(gone, original(1))).toEqual(gone)
  })
})
