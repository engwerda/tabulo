import { generateNKeysBetween } from "fractional-indexing"
import type { Board, BoardCard } from "../../shared/api.ts"

// Ranks are fractional-indexing keys, which sort by code unit. localeCompare would misorder them.
const byRankThenRecent = (a: BoardCard, b: BoardCard) => {
  if (a.rank !== null && b.rank !== null) return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
  if (a.rank !== null) return -1
  if (b.rank !== null) return 1
  return b.updatedAt.localeCompare(a.updatedAt)
}

/** Every card of a column in board order: ranked cards by rank, then the rest newest first. */
export const columnCards = (cards: ReadonlyArray<BoardCard>, column: string) =>
  cards.filter((card) => card.column === column).sort(byRankThenRecent)

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

/** Where a card goes: a column, and its index among that column's other cards. */
export type CardMove = { readonly key: string; readonly toColumn: string; readonly index: number }

/** The destination column's full order after `move`, ignoring any filters. */
export const orderAfterMove = (board: Board, move: CardMove) => {
  const others = columnCards(board.cards, move.toColumn)
    .map((card) => card.key)
    .filter((key) => key !== move.key)
  return [...others.slice(0, move.index), move.key, ...others.slice(move.index)]
}

/** The board as it will look once the server has applied `move`. */
export const applyMove = (
  board: Board,
  move: CardMove,
  orderedKeys: ReadonlyArray<string>,
  now: string,
): Board => {
  const ranks = new Map(
    generateNKeysBetween(null, null, orderedKeys.length).map((rank, index) => [
      orderedKeys[index],
      rank,
    ]),
  )
  return {
    ...board,
    cards: board.cards.map((card) => {
      if (card.key === move.key) {
        const closed = move.toColumn === "done"
        return {
          ...card,
          column: move.toColumn,
          rank: ranks.get(card.key) ?? null,
          state: closed ? "closed" : "open",
          closedAt: closed ? (card.closedAt ?? now) : null,
        }
      }
      return ranks.has(card.key) ? { ...card, rank: ranks.get(card.key) ?? null } : card
    }),
  }
}
