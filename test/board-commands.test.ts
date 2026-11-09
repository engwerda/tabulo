import { describe, expect, it } from "vitest"
import { type BoardCommandsInput, boardCommands } from "../src/client/board/board-commands.ts"
import { rankSections } from "../src/client/palette/rank.ts"

const input = (overrides: Partial<BoardCommandsInput> = {}): BoardCommandsInput => ({
  filtersShown: true,
  cards: [],
  filters: { assignee: [], milestone: null, label: [], text: "" },
  newIssueColumn: "Todo",
  newIssue: () => {},
  toggleMine: () => {},
  setFilter: () => {},
  clearFilters: () => {},
  focusSearch: () => {},
  refresh: () => {},
  updated: "Updated just now",
  boardName: "Design",
  editBoard: () => {},
  newBoard: () => {},
  ...overrides,
})

const boardIds = (overrides: Partial<BoardCommandsInput>) =>
  boardCommands(input(overrides))
    .find((group) => group.id === "board")
    ?.items.map((item) => item.id) ?? []

const emptyPalette = (overrides: Partial<BoardCommandsInput>) =>
  rankSections("", boardCommands(input(overrides)), [])
    .find((section) => section.id === "board")
    ?.rows.map((row) => row.item.id) ?? []

describe("the board's commands", () => {
  it("offers only Refresh and the board's settings while the board shows no filters", () => {
    const groups = boardCommands(input({ filtersShown: false }))
    expect(groups.map((group) => group.id)).toEqual(["board"])
    expect(boardIds({ filtersShown: false })).toEqual(["board:refresh", "board:edit", "board:new"])
  })

  it("offers Edit board and New board only to members", () => {
    const visitor = { newIssueColumn: null, editBoard: null, newBoard: null }
    expect(boardIds(visitor)).not.toContain("board:edit")
    expect(boardIds(visitor)).not.toContain("board:new")
    expect(boardIds({ ...visitor, filtersShown: false })).toEqual(["board:refresh"])
    expect(boardIds({})).toEqual(expect.arrayContaining(["board:edit", "board:new"]))
    expect(boardIds({ newBoard: null })).toContain("board:edit")
    expect(boardIds({ newBoard: null })).not.toContain("board:new")
  })

  it("lists Edit board and New board in the empty palette when every command is offered", () => {
    const filtered = { filters: { assignee: [], milestone: null, label: ["Kind/Bug"], text: "" } }
    expect(boardIds(filtered)).toHaveLength(10)
    expect(emptyPalette(filtered)).toEqual(
      expect.arrayContaining(["board:new-issue", "board:edit", "board:new"]),
    )
  })
})
