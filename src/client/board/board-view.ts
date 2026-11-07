import type { Board, BoardCard } from "../../shared/api.ts"
import { compareCardOrder, rankForDrop } from "../../shared/card-order.ts"

/** Every card of a column in board order. */
export const columnCards = (cards: ReadonlyArray<BoardCard>, column: string) =>
  cards.filter((card) => card.column === column).sort(compareCardOrder)

export type BoardFilters = {
  readonly assignee: string | null
  readonly milestone: string | null
  readonly label: string | null
  readonly text: string
}

export const FILTER_PARAMS = {
  assignee: "assignee",
  milestone: "milestone",
  label: "label",
  text: "q",
} as const satisfies Record<keyof BoardFilters, string>

export const readFilters = (params: URLSearchParams): BoardFilters => ({
  assignee: params.get(FILTER_PARAMS.assignee),
  milestone: params.get(FILTER_PARAMS.milestone),
  label: params.get(FILTER_PARAMS.label),
  text: params.get(FILTER_PARAMS.text) ?? "",
})

export const isFiltered = (filters: BoardFilters) =>
  filters.assignee !== null ||
  filters.milestone !== null ||
  filters.label !== null ||
  filters.text.trim() !== ""

export const matchesFilters = (card: BoardCard, filters: BoardFilters) => {
  const text = filters.text.trim().toLowerCase()
  return (
    (filters.assignee === null ||
      card.assignees.some((assignee) => assignee.login === filters.assignee)) &&
    (filters.milestone === null || card.milestone === filters.milestone) &&
    (filters.label === null || card.labels.some((label) => label.name === filters.label)) &&
    (text === "" ||
      card.title.toLowerCase().includes(text) ||
      `${card.repo}#${card.number}`.toLowerCase().includes(text))
  )
}

const sortedUnique = (values: ReadonlyArray<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b))

/** The values each filter can take on this board. */
export const filterChoices = (cards: ReadonlyArray<BoardCard>) => ({
  assignees: sortedUnique(cards.flatMap((card) => card.assignees.map(({ login }) => login))),
  milestones: sortedUnique(
    cards.flatMap((card) => (card.milestone === null ? [] : [card.milestone])),
  ),
  labels: sortedUnique(cards.flatMap((card) => card.labels.map(({ name }) => name))),
})

/** Where a card goes: a column, and the cards shown directly above and below it there. */
export type CardMove = {
  readonly key: string
  readonly toColumn: string
  readonly afterKey: string | null
  readonly beforeKey: string | null
}

/** The neighbours of a card dropped at `index` among the other cards shown in a column. */
export const dropNeighbours = (shownKeys: ReadonlyArray<string>, key: string, index: number) => {
  const others = shownKeys.filter((other) => other !== key)
  return { afterKey: others[index - 1] ?? null, beforeKey: others[index] ?? null }
}

/**
 * The board as it will look once the server has applied `move`, ranked by the server's rule.
 * Unchanged when the move does not fit the board.
 */
export const applyMove = (board: Board, move: CardMove, now: string): Board => {
  const rank = rankForDrop(new Map(board.cards.map((card) => [card.key, card] as const)), {
    movedKey: move.key,
    column: move.toColumn,
    afterKey: move.afterKey,
    beforeKey: move.beforeKey,
  })
  if (rank === undefined) return board
  const closed = move.toColumn === "done"
  return replaceCard(board, move.key, (card) => ({
    ...card,
    column: move.toColumn,
    rank,
    state: closed ? "closed" : "open",
    closedAt: closed ? (card.closedAt ?? now) : null,
  }))
}

export const replaceCard = (board: Board, key: string, change: (card: BoardCard) => BoardCard) => ({
  ...board,
  cards: board.cards.map((card) => (card.key === key ? change(card) : card)),
})
