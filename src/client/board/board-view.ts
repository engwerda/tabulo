import type { Board, BoardCard } from "../../shared/api.ts"
import { compareCardOrder, rankForDrop } from "../../shared/card-order.ts"

// Organization names compare without regard to case, and the board's own `org` is lowercased
// while the address keeps the case it was typed in.
export const everyBoardQueryKey = (org: string) => ["board", org.toLowerCase()] as const

export const boardQueryKey = (org: string, board: string) =>
  [...everyBoardQueryKey(org), board] as const

export const boardListQueryKey = (org: string) => ["boards", org] as const

export const boardWriteKey = (org: string) => ["board-write", org.toLowerCase()] as const

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

/**
 * Only what `applyMove` changed goes back, so whatever else changed meanwhile stays, such as
 * saved settings, another card's move, or this card's assignees.
 */
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

const samePlacement = (a: BoardCard, b: BoardCard) =>
  a.column === b.column && a.rank === b.rank && a.state === b.state && a.closedAt === b.closedAt

export const sameKeys = (a: ReadonlyArray<{ key: string }>, b: ReadonlyArray<{ key: string }>) =>
  a.length === b.length && a.every((column, index) => column.key === b[index]?.key)

const sameFields = <T extends object>(a: T, b: T) =>
  (Object.keys(a) as Array<keyof T>).every((field) => a[field] === b[field])

/**
 * The board with `held`'s layout, its columns and where each card is, and everything else from
 * `live`. A card that only `live` has waits, and one that `live` no longer has stays. So does
 * all of `held`'s version of a card that `visible`, the board's filters, judges differently in
 * the two, so another person's change neither shows nor hides it. `live` itself when the layouts
 * are the same, so nothing waits, and `held` itself when it already is the result, so holding
 * the held board again changes nothing.
 */
export const heldBoard = (
  held: Board,
  live: Board,
  visible: (card: BoardCard) => boolean,
): Board => {
  const liveCards = new Map(live.cards.map((card) => [card.key, card] as const))
  const heldKeys = new Set(held.cards.map((card) => card.key))
  // Cards the filters hide in both boards cannot move anything on screen, so they never wait.
  const sameLayout =
    sameKeys(held.columns, live.columns) &&
    sameKeys(held.allColumns, live.allColumns) &&
    held.cards.every((card) => {
      const now = liveCards.get(card.key)
      if (now === undefined) return !visible(card)
      return visible(card) === visible(now) && (!visible(card) || samePlacement(card, now))
    }) &&
    live.cards.every((card) => heldKeys.has(card.key) || !visible(card))
  if (sameLayout) return live
  const cards = held.cards.map((card) => {
    const now = liveCards.get(card.key)
    if (now === undefined || visible(card) !== visible(now)) return card
    if (samePlacement(card, now)) return now
    const { column, rank, state, closedAt } = card
    const placed = { ...now, column, rank, state, closedAt }
    return sameFields(placed, card) ? card : placed
  })
  const board = { ...live, columns: held.columns, allColumns: held.allColumns }
  return cards.every((card, index) => card === held.cards[index]) &&
    sameFields({ ...board, cards: held.cards }, held)
    ? held
    : { ...board, cards }
}

export type LayoutChanges = {
  readonly added: number
  readonly removed: number
  /** Cards shown in both boards whose column changed. */
  readonly moved: number
}

/** What changed among the cards that `visible`, the board's filters, shows in each board. */
export const layoutChanges = (
  before: Board,
  after: Board,
  visible: (card: BoardCard) => boolean,
): LayoutChanges => {
  const columns = (board: Board) =>
    new Map(board.cards.filter(visible).map((card) => [card.key, card.column] as const))
  const columnBefore = columns(before)
  const columnAfter = columns(after)
  const keysOnly = (a: Map<string, string>, b: Map<string, string>) =>
    [...a.keys()].filter((key) => !b.has(key)).length
  return {
    added: keysOnly(columnAfter, columnBefore),
    removed: keysOnly(columnBefore, columnAfter),
    moved: [...columnAfter].filter(([key, column]) => {
      const was = columnBefore.get(key)
      return was !== undefined && was !== column
    }).length,
  }
}

/** "Board updated: 2 added, 1 moved", or null when no card was added, moved, or removed. */
export const announceLayout = ({ added, moved, removed }: LayoutChanges) => {
  const parts = [
    [added, "added"],
    [moved, "moved"],
    [removed, "removed"],
  ] as const
  const said = parts.filter(([count]) => count > 0).map(([count, word]) => `${count} ${word}`)
  return said.length === 0 ? null : `Board updated: ${said.join(", ")}`
}

/**
 * `snapshot` is the board as it last showed while the person uses the board, null when nothing
 * is held. `following` says why the hold takes every board as it is read: a write of the
 * person's own, while it is pending and until the read that follows it lands, or Refresh, until
 * its read lands.
 */
export type BoardHold = {
  readonly snapshot: Board | null
  readonly following: false | "write" | "refresh"
}

export const NO_HOLD: BoardHold = { snapshot: null, following: false }

/** What the board is doing at one step: in use by the person, writing, or reading. */
export type BoardActivity = {
  readonly using: boolean
  readonly writing: boolean
  readonly reading: boolean
}

/**
 * The hold once the board is `live`. Use keeps the layout of the moment it began, and its end
 * lets the latest layout land. A write makes the hold follow `live` until the write has ended and
 * the read after it has landed, so the person's own changes, their rollbacks, and the board as
 * the server then has it show at once. `visible` is the board's filters.
 */
export const nextHold = (
  hold: BoardHold,
  live: Board | undefined,
  { using, writing, reading }: BoardActivity,
  visible: (card: BoardCard) => boolean,
): BoardHold => {
  const following = writing ? "write" : reading ? hold.following : false
  const snapshot =
    live === undefined || !using
      ? null
      : writing || hold.following !== false || hold.snapshot === null
        ? live
        : heldBoard(hold.snapshot, live, visible)
  return snapshot === hold.snapshot && following === hold.following ? hold : { snapshot, following }
}

/**
 * The hold once Refresh asks for what waits, and the board's next read, to show at once. A
 * write's read keeps following as the write's, so it stays unannounced.
 */
export const landHold = (hold: BoardHold): BoardHold =>
  hold.following === false ? { ...hold, following: "refresh" } : hold

/** Keyed, so the same words said twice are announced twice. */
export type Announcement = { readonly id: number; readonly text: string }

/**
 * What screen readers were last told about the board: the board that showed, why the hold then
 * followed reads, whether a read since the page opened has shown, and the latest announcement.
 */
export type BoardSeen = {
  readonly board: Board | undefined
  readonly following: BoardHold["following"]
  readonly fetched: boolean
  readonly announcement: Announcement | null
}

/**
 * What screen readers are told once `now` shows, counting the cards that `visible`, the board's
 * filters, shows. A layout change is announced unless the person's own write brought it, while
 * pending, as it ends, or with the read after it, or no read since the page opened had shown
 * yet, as when it opens on a board read before. `now.fetched` says whether the board was read
 * since the page opened; that read has shown once `now.board` is `live`, not a held board.
 */
export const nextSeen = (
  seen: BoardSeen,
  now: Omit<BoardSeen, "announcement">,
  live: Board | undefined,
  visible: (card: BoardCard) => boolean,
): BoardSeen => {
  const fetched = seen.fetched || (now.fetched && now.board === live)
  if (seen.board === now.board && seen.following === now.following && seen.fetched === fetched) {
    return seen
  }
  const text =
    seen.board === now.board ||
    seen.board === undefined ||
    now.board === undefined ||
    seen.following === "write" ||
    now.following === "write" ||
    !seen.fetched
      ? null
      : announceLayout(layoutChanges(seen.board, now.board, visible))
  return {
    board: now.board,
    following: now.following,
    fetched,
    announcement:
      text === null ? seen.announcement : { id: (seen.announcement?.id ?? 0) + 1, text },
  }
}
