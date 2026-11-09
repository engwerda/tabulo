import type { Board, BoardCard } from "../../shared/api.ts"
import { compareCardOrder, rankForDrop } from "../../shared/card-order.ts"

export const orgBoardsKey = (org: string) => ["board", org] as const

export const boardQueryKey = (org: string, board: string) => [...orgBoardsKey(org), board] as const

export const boardsQueryKey = (org: string) => ["boards", org] as const

export const boardWriteKey = (org: string) => ["board-write", org] as const

/** Every card of a column in board order. */
export const columnCards = (cards: ReadonlyArray<BoardCard>, column: string) =>
  cards.filter((card) => card.column === column).sort(compareCardOrder)

export type BoardFilters = {
  /** Logins, ME, or NONE; a card matches when it has any of them. Empty means any. */
  readonly assignee: ReadonlyArray<string>
  /** A milestone title or NONE. */
  readonly milestone: string | null
  /** Full label names or NONE; a card matches when it has any of them. Empty means any. */
  readonly label: ReadonlyArray<string>
  readonly text: string
}

/** Filter values that are not names. Logins cannot contain @; a milestone titled @none loses. */
export const ME = "@me"
export const NONE = "@none"

export const FILTER_PARAMS = {
  assignee: "assignee",
  milestone: "milestone",
  label: "label",
  text: "q",
} as const satisfies Record<keyof BoardFilters, string>

export const readFilters = (params: URLSearchParams): BoardFilters => ({
  assignee: params.getAll(FILTER_PARAMS.assignee),
  milestone: params.get(FILTER_PARAMS.milestone),
  label: params.getAll(FILTER_PARAMS.label),
  text: params.get(FILTER_PARAMS.text) ?? "",
})

/** `params` with `filter` set to `values`; no values remove the filter. */
export const withFilter = (
  params: URLSearchParams,
  filter: keyof BoardFilters,
  values: ReadonlyArray<string>,
) => {
  const next = new URLSearchParams(params)
  next.delete(FILTER_PARAMS[filter])
  for (const value of values) if (value !== "") next.append(FILTER_PARAMS[filter], value)
  return next
}

/** `values` with `value` added, or removed when it is there. */
export const toggled = (values: ReadonlyArray<string>, value: string) =>
  values.includes(value) ? values.filter((other) => other !== value) : [...values, value]

export const isFiltered = (filters: BoardFilters) =>
  filters.assignee.length > 0 ||
  filters.milestone !== null ||
  filters.label.length > 0 ||
  filters.text.trim() !== ""

const matchesAssignee = (card: BoardCard, assignee: string, viewer: string) => {
  if (assignee === NONE) return card.assignees.length === 0
  const login = assignee === ME ? viewer : assignee
  return card.assignees.some((candidate) => candidate.login === login)
}

const matchesLabel = (card: BoardCard, label: string) =>
  label === NONE
    ? card.labels.length === 0
    : card.labels.some((candidate) => candidate.name === label)

const matchesText = (card: BoardCard, query: string) => {
  const text = query.trim().toLowerCase()
  if (text === "") return true
  // "#12" names an issue number; plain words also search the title and repo#number.
  if (/^#\d+$/.test(text)) return `#${card.number}` === text
  return (
    card.title.toLowerCase().includes(text) ||
    String(card.number) === text ||
    `${card.repo}#${card.number}`.toLowerCase().includes(text)
  )
}

/** `viewer` is the signed-in login, which ME stands for. */
export const matchesFilters = (card: BoardCard, filters: BoardFilters, viewer: string) =>
  (filters.assignee.length === 0 ||
    filters.assignee.some((assignee) => matchesAssignee(card, assignee, viewer))) &&
  (filters.milestone === null ||
    (filters.milestone === NONE
      ? card.milestone === null
      : card.milestone === filters.milestone)) &&
  (filters.label.length === 0 || filters.label.some((label) => matchesLabel(card, label))) &&
  matchesText(card, filters.text)

const sortedUnique = (values: ReadonlyArray<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b))

/** The values each filter can take on this board, with the colors and avatars to show. */
export const filterChoices = (cards: ReadonlyArray<BoardCard>) => {
  const avatars = new Map<string, string>()
  const colors = new Map<string, string>()
  for (const card of cards) {
    for (const { login, avatarUrl } of card.assignees) avatars.set(login, avatarUrl)
    for (const { name, color } of card.labels) colors.set(name, color)
  }
  return {
    assignees: sortedUnique([...avatars.keys()]).map((login) => ({
      login,
      avatarUrl: avatars.get(login) ?? "",
    })),
    milestones: sortedUnique(
      cards.flatMap((card) => (card.milestone === null ? [] : [card.milestone])),
    ),
    labels: sortedUnique([...colors.keys()]).map((name) => ({
      name,
      color: colors.get(name) ?? "#a1a1aa",
    })),
  }
}

/** Where a card goes: a column, and the cards shown directly above and below it there. */
export type CardMove = {
  readonly key: string
  readonly toColumn: string
  readonly afterKey: string | null
  readonly beforeKey: string | null
}

/** While a card is dragged over another column: that column, and its index among the shown cards. */
export type DragPreview = { readonly key: string; readonly column: string; readonly index: number }

/** The keys `column` shows during a drag, with the dragged card where `preview` puts it. */
export const previewKeys = (
  shownKeys: ReadonlyArray<string>,
  column: string,
  preview: DragPreview | null,
): ReadonlyArray<string> => {
  if (preview === null) return shownKeys
  const others = shownKeys.filter((key) => key !== preview.key)
  if (column !== preview.column) return others
  return [...others.slice(0, preview.index), preview.key, ...others.slice(preview.index)]
}

/**
 * The cards above and below `key` once it is dropped on `overKey`, as a sortable list shows it:
 * it takes the place of the card it is over. `overKey` null keeps its place in `keys`, and a
 * card missing from `keys` goes to the end.
 */
export const neighboursAfterDrop = (
  keys: ReadonlyArray<string>,
  key: string,
  overKey: string | null,
) => {
  const others = keys.filter((other) => other !== key)
  const from = keys.indexOf(key)
  const to = overKey === null ? from : keys.indexOf(overKey)
  const index = from === -1 ? others.length : to === -1 ? from : to
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

export const revertMove = (board: Board, before: BoardCard): Board => {
  const shown = board.columns.some((column) => column.key === before.column)
  return {
    ...board,
    cards: board.cards.flatMap((card) => {
      if (card.key !== before.key) return [card]
      if (!shown) return []
      const { column, rank, state, closedAt } = before
      return [{ ...card, column, rank, state, closedAt }]
    }),
  }
}

export const replaceCard = (board: Board, key: string, change: (card: BoardCard) => BoardCard) => ({
  ...board,
  cards: board.cards.map((card) => (card.key === key ? change(card) : card)),
})
