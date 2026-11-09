import {
  type Board,
  type BoardColumn,
  type CreateBoardRequest,
  MAX_BOARD_NAME,
  MAX_REPOS,
  type SavedBoard,
  type UpdateBoardRequest,
} from "../../shared/api.ts"

export type SettingsBase = Pick<Board, "board" | "allColumns">

export type BoardDraft = {
  readonly name: string
  readonly repos: ReadonlyArray<string>
  readonly order: ReadonlyArray<string>
  readonly hidden: ReadonlyArray<string>
  readonly dropUnreadable: boolean
}

export const NEW_BOARD_DRAFT: BoardDraft = {
  name: "",
  repos: [],
  order: [],
  hidden: [],
  dropUnreadable: false,
}

export const draftOf = ({ board, allColumns }: SettingsBase): BoardDraft => {
  const hidden = new Set(board.hidden)
  return {
    name: board.name,
    repos: board.repos,
    order: allColumns.map((column) => column.key),
    hidden: allColumns.filter((column) => hidden.has(column.key)).map((column) => column.key),
    dropUnreadable: false,
  }
}

export type ColumnRow = { readonly column: BoardColumn; readonly hidden: boolean }

export const columnRows = (
  columns: ReadonlyArray<BoardColumn>,
  draft: BoardDraft,
): ReadonlyArray<ColumnRow> => {
  const byKey = new Map(columns.map((column) => [column.key, column]))
  const hidden = new Set(draft.hidden)
  return draft.order.flatMap((key) => {
    const column = byKey.get(key)
    return column === undefined ? [] : [{ column, hidden: hidden.has(key) }]
  })
}

export const moveColumn = (draft: BoardDraft, key: string, index: number): BoardDraft => {
  const others = draft.order.filter((other) => other !== key)
  if (others.length === draft.order.length) return draft
  const at = Math.max(0, Math.min(index, others.length))
  return { ...draft, order: [...others.slice(0, at), key, ...others.slice(at)] }
}

export const setColumnHidden = (draft: BoardDraft, key: string, hidden: boolean): BoardDraft => {
  const others = draft.hidden.filter((other) => other !== key)
  return { ...draft, hidden: hidden ? [...others, key] : others }
}

export const DRAFT_FIELDS = ["name", "repos", "columns", "hidden"] as const
export type DraftField = (typeof DRAFT_FIELDS)[number]

const sameSet = (
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
  normalize = (value: string) => value,
) => {
  const values = new Set(a.map(normalize))
  return (
    values.size === new Set(b.map(normalize)).size &&
    b.every((value) => values.has(normalize(value)))
  )
}

const SAME: Record<DraftField, (a: BoardDraft, b: BoardDraft) => boolean> = {
  name: (a, b) => a.name.trim() === b.name.trim(),
  repos: (a, b) => sameSet(a.repos, b.repos, (name) => name.toLowerCase()),
  columns: (a, b) =>
    a.order.length === b.order.length && a.order.every((key, i) => key === b.order[i]),
  hidden: (a, b) => sameSet(a.hidden, b.hidden),
}

const changedFields = (from: BoardDraft, to: BoardDraft): ReadonlyArray<DraftField> =>
  DRAFT_FIELDS.filter((field) => !SAME[field](from, to))

export const isDirty = (base: SettingsBase, draft: BoardDraft) =>
  draft.dropUnreadable || changedFields(draftOf(base), draft).length > 0

export type DraftProblem = { readonly field: "name" | "repos"; readonly message: string }

export const draftProblem = (draft: BoardDraft, unreadable = 0): DraftProblem | null => {
  const name = draft.name.trim()
  if (name === "") return { field: "name", message: "Name the board" }
  if (name.length > MAX_BOARD_NAME) {
    return { field: "name", message: `Shorten the name to ${MAX_BOARD_NAME} characters` }
  }
  if (draft.repos.length === 0) return { field: "repos", message: "Choose a repository" }
  const kept = draft.dropUnreadable ? 0 : unreadable
  if (draft.repos.length + kept <= MAX_REPOS) return null
  return {
    field: "repos",
    message:
      kept === 0
        ? `Choose at most ${MAX_REPOS} repositories`
        : `Choose at most ${Math.max(0, MAX_REPOS - kept)} repositories, or remove the ones you cannot read`,
  }
}

export const toCreateRequest = (org: string, draft: BoardDraft): CreateBoardRequest => ({
  org,
  name: draft.name.trim(),
  repos: draft.repos,
})

/**
 * A column list the user left alone is sent as stored, so a label added in Forgejo later still
 * takes its place by name. A changed one keeps the stored keys that have no column, so a label
 * that comes back gets its old place.
 */
export const toUpdateRequest = (
  org: string,
  base: SettingsBase,
  draft: BoardDraft,
): UpdateBoardRequest => {
  const original = draftOf(base)
  const laidOut = new Set(base.allColumns.map((column) => column.key))
  const withoutColumn = (keys: ReadonlyArray<string>) => keys.filter((key) => !laidOut.has(key))
  return {
    org,
    board: base.board.id,
    version: base.board.version,
    name: draft.name.trim(),
    repos: draft.repos,
    columns: SAME.columns(original, draft)
      ? base.board.columns
      : [...draft.order, ...withoutColumn(base.board.columns)],
    hidden: SAME.hidden(original, draft)
      ? base.board.hidden
      : [...draft.hidden, ...withoutColumn(base.board.hidden)],
    dropUnreadable: draft.dropUnreadable,
  }
}

const withCurrentColumns = (mine: ReadonlyArray<string>, current: ReadonlyArray<string>) => {
  const present = new Set(current)
  const order = mine.filter((key) => present.has(key))
  current.forEach((key, index) => {
    if (order.includes(key)) return
    const before = current
      .slice(0, index)
      .reverse()
      .find((earlier) => order.includes(earlier))
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, key)
  })
  return order
}

export const rebaseDraft = (
  base: SettingsBase,
  theirs: SettingsBase,
  mine: BoardDraft,
): { readonly draft: BoardDraft; readonly theirChanges: ReadonlyArray<DraftField> } => {
  const original = draftOf(base)
  const current = draftOf(theirs)
  const kept = (field: DraftField) => !SAME[field](original, mine)
  const columns = new Set(current.order)
  const theirChanges = changedFields(original, current)
  const unreadableChanged = base.board.unreadableRepos !== theirs.board.unreadableRepos
  return {
    draft: {
      name: kept("name") ? mine.name : current.name,
      repos: kept("repos") ? mine.repos : current.repos,
      order: kept("columns") ? withCurrentColumns(mine.order, current.order) : current.order,
      hidden: kept("hidden") ? mine.hidden.filter((key) => columns.has(key)) : current.hidden,
      dropUnreadable: mine.dropUnreadable && theirs.board.unreadableRepos > 0,
    },
    theirChanges:
      unreadableChanged && !theirChanges.includes("repos")
        ? DRAFT_FIELDS.filter((field) => field === "repos" || theirChanges.includes(field))
        : theirChanges,
  }
}

const FIELD_WORDS: Record<DraftField, string> = {
  name: "the name",
  repos: "the repositories",
  columns: "the column order",
  hidden: "the hidden columns",
}

export const describeFields = (fields: ReadonlyArray<DraftField>) => {
  const words = fields.map((field) => FIELD_WORDS[field])
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
}

export const withColumnOrder = (board: Board, order: ReadonlyArray<string>): Board => {
  const byKey = new Map(board.allColumns.map((column) => [column.key, column]))
  const shown = new Set(board.columns.map((column) => column.key))
  const allColumns = withCurrentColumns(order, [...byKey.keys()]).flatMap(
    (key) => byKey.get(key) ?? [],
  )
  return { ...board, allColumns, columns: allColumns.filter((column) => shown.has(column.key)) }
}

export const applySavedBoard = (
  board: Board,
  saved: SavedBoard,
  order: ReadonlyArray<string> = board.allColumns.map((column) => column.key),
): Board => {
  const { allColumns } = withColumnOrder(board, order)
  const hidden = new Set(saved.hidden)
  const repos = new Set(saved.repos.map((name) => name.toLowerCase()))
  return {
    ...board,
    board: saved,
    allColumns,
    columns: allColumns.filter((column) => !hidden.has(column.key)),
    cards: board.cards.filter(
      (card) => !hidden.has(card.column) && repos.has(card.repo.toLowerCase()),
    ),
    failedRepos: board.failedRepos.filter((failure) => repos.has(failure.repo.toLowerCase())),
  }
}
