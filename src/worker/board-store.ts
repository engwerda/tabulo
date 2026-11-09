import { Clock, Context, Effect, Option, Schema } from "effect"
import {
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  MAX_BOARDS,
  MAX_REPOS,
  type SavedBoard,
} from "../shared/api.ts"
import { BoardChanged, BoardLimitReached, BoardNotFound } from "./errors.ts"
import type { ForgejoRepo } from "./forgejo/schemas.ts"

/** A board id, lowercased because ids compare without regard to case. */
const BoardIdText = Schema.String.check(Schema.isPattern(/^(default|[a-z0-9]{8})$/)).pipe(
  Schema.brand("BoardId"),
)
export type BoardId = typeof BoardIdText.Type

export const DEFAULT_BOARD: BoardId = Schema.decodeUnknownSync(BoardIdText)(DEFAULT_BOARD_ID)

/** The board `value` names, or null for text that cannot be a board id. */
export const parseBoardId = (value: string): BoardId | null =>
  Option.getOrNull(Schema.decodeUnknownOption(BoardIdText)(value.toLowerCase()))

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
// The largest multiple of 36 that fits in a byte; larger bytes are drawn again, so every
// character is equally likely.
const ID_BYTE_LIMIT = 252

const newBoardId = (): BoardId => {
  let id = ""
  while (id.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte < ID_BYTE_LIMIT && id.length < 8) id += ID_ALPHABET[byte % ID_ALPHABET.length]
    }
  }
  return Schema.decodeUnknownSync(BoardIdText)(id)
}

/**
 * One board of an organization: stored, or the default board that no member has changed, which
 * has version 0 and the repositories `defaultRepos` gives one viewer. It is also the column plan
 * `boardLayout` reads.
 */
export type BoardRecord = {
  readonly id: BoardId
  readonly name: string
  /** Lowercased names, whether or not any one viewer can read them. */
  readonly repos: ReadonlyArray<string>
  /** As stored, keys the organization has no column for included. */
  readonly columns: ReadonlyArray<string>
  readonly hidden: ReadonlyArray<string>
  readonly version: number
}

export type BoardFields = Pick<BoardRecord, "name" | "repos" | "columns" | "hidden">

/** The board a write read: its version must still be the stored one. */
export type BoardVersion = Pick<BoardRecord, "id" | "version">

/** The organization's boards. Only this service reads or writes the `boards` table. */
export class BoardStore extends Context.Service<
  BoardStore,
  {
    /** Every stored board of the organization, in no order. */
    readonly list: (org: string) => Effect.Effect<ReadonlyArray<BoardRecord>>
    /** The stored board; undefined for no such board and for a default board nobody changed. */
    readonly find: (org: string, id: BoardId) => Effect.Effect<BoardRecord | undefined>
    /**
     * Stores a new board at version 1 under a fresh id, unless the organization already has
     * MAX_BOARDS boards, the default one counted whether stored or not. One statement checks
     * and inserts, so two members adding the last board at once cannot both succeed.
     */
    readonly insert: (
      org: string,
      fields: BoardFields,
      updatedBy: string,
    ) => Effect.Effect<BoardRecord, BoardLimitReached>
    /**
     * Replaces the board's fields if its stored version is still `current.version` and answers
     * the stored board. Version 0 stores the default board for the first time.
     */
    readonly replace: (
      org: string,
      current: BoardVersion,
      fields: BoardFields,
      updatedBy: string,
    ) => Effect.Effect<BoardRecord, BoardChanged | BoardNotFound>
    /** Deletes the board if its stored version is still `current.version`. Card order stays. */
    readonly remove: (
      org: string,
      current: BoardVersion,
    ) => Effect.Effect<void, BoardChanged | BoardNotFound>
  }
>()("tabulo/BoardStore") {}

const KeyList = Schema.fromJsonString(Schema.Array(Schema.String))

const BoardRow = Schema.Struct({
  id: BoardIdText,
  name: Schema.String,
  repos: KeyList,
  column_order: KeyList,
  hidden_columns: KeyList,
  version: Schema.Number,
})

const ROW = "id, name, repos, column_order, hidden_columns, version"

// Only this module writes the table, so a row that does not decode is a defect.
const toRecord = (row: unknown): BoardRecord => {
  const { column_order, hidden_columns, ...rest } = Schema.decodeUnknownSync(BoardRow)(row)
  return { ...rest, columns: column_order, hidden: hidden_columns }
}

// D1 failures are infrastructure faults, not domain outcomes, so they surface as defects.
const query = <A>(run: () => Promise<A>) => Effect.promise(run)

export const makeBoardStore = (db: D1Database): BoardStore["Service"] => {
  const fieldValues = (fields: BoardFields) => [
    fields.name,
    JSON.stringify(fields.repos),
    JSON.stringify(fields.columns),
    JSON.stringify(fields.hidden),
  ]

  /** Why a compare-and-swap changed no row: the board is gone, or its version moved on. */
  const refusal = (org: string, id: BoardId) =>
    query(() =>
      db.prepare("SELECT 1 FROM boards WHERE org = ? AND id = ?").bind(org, id).first(),
    ).pipe(
      Effect.flatMap(
        (row): Effect.Effect<never, BoardChanged | BoardNotFound> =>
          Effect.fail(row === null ? new BoardNotFound() : new BoardChanged()),
      ),
    )

  return {
    list: (org) =>
      query(() => db.prepare(`SELECT ${ROW} FROM boards WHERE org = ?`).bind(org).all()).pipe(
        Effect.map(({ results }) => results.map(toRecord)),
      ),

    find: (org, id) =>
      query(() =>
        db.prepare(`SELECT ${ROW} FROM boards WHERE org = ? AND id = ?`).bind(org, id).first(),
      ).pipe(Effect.map((row) => (row === null ? undefined : toRecord(row)))),

    insert: (org, fields, updatedBy) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        // A fresh id that is already taken (one chance in 2.8e12) fails the statement as a defect.
        const row = yield* query(() =>
          db
            .prepare(
              `INSERT INTO boards (org, id, name, repos, column_order, hidden_columns, version,
                 updated_at, updated_by)
               SELECT ?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8
               WHERE (SELECT COUNT(*) FROM boards WHERE org = ?1 AND id <> ?9) < ?10
               RETURNING ${ROW}`,
            )
            .bind(
              org,
              newBoardId(),
              ...fieldValues(fields),
              now,
              updatedBy,
              DEFAULT_BOARD,
              MAX_BOARDS - 1,
            )
            .first(),
        )
        if (row === null) return yield* new BoardLimitReached()
        return toRecord(row)
      }),

    replace: (org, current, fields, updatedBy) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const values = [org, current.id, ...fieldValues(fields), now, updatedBy]
        // Only the default board exists before it is stored, so version 0 can insert only it.
        const row =
          current.version === 0
            ? current.id === DEFAULT_BOARD
              ? yield* query(() =>
                  db
                    .prepare(
                      `INSERT INTO boards (org, id, name, repos, column_order, hidden_columns,
                         version, updated_at, updated_by)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)
                       ON CONFLICT (org, id) DO NOTHING
                       RETURNING ${ROW}`,
                    )
                    .bind(...values)
                    .first(),
                )
              : null
            : yield* query(() =>
                db
                  .prepare(
                    `UPDATE boards SET name = ?3, repos = ?4, column_order = ?5,
                       hidden_columns = ?6, version = version + 1, updated_at = ?7,
                       updated_by = ?8
                     WHERE org = ?1 AND id = ?2 AND version = ?9
                     RETURNING ${ROW}`,
                  )
                  .bind(...values, current.version)
                  .first(),
              )
        return row === null ? yield* refusal(org, current.id) : toRecord(row)
      }),

    remove: (org, current) =>
      Effect.gen(function* () {
        const { meta } = yield* query(() =>
          db
            .prepare("DELETE FROM boards WHERE org = ? AND id = ? AND version = ?")
            .bind(org, current.id, current.version)
            .run(),
        )
        if (meta.changes === 0) return yield* refusal(org, current.id)
      }),
  }
}

const byName = new Intl.Collator("en").compare

/**
 * The repositories of a default board no member has changed, for one viewer: the organization's
 * repositories that are not archived when there are at most MAX_REPOS, none otherwise.
 */
export const defaultRepos = (orgRepos: ReadonlyArray<ForgejoRepo>) => {
  const active = orgRepos.filter((repo) => !repo.archived)
  return active.length > MAX_REPOS
    ? []
    : active
        .map((repo) => repo.name)
        .sort(byName)
        .map((name) => name.toLowerCase())
}

/** The default board no member has changed, as one viewer sees it. */
export const unchangedDefault = (
  defaultColumns: ReadonlyArray<string>,
  orgRepos: ReadonlyArray<ForgejoRepo>,
): BoardRecord => ({
  id: DEFAULT_BOARD,
  name: DEFAULT_BOARD_NAME,
  repos: defaultRepos(orgRepos),
  columns: defaultColumns,
  hidden: [],
  version: 0,
})

/** The board in an answer: `repos` the viewer can read and a count of the others. */
export const toSavedBoard = (
  board: BoardRecord,
  repos: ReadonlyArray<string>,
  unreadableRepos: number,
): SavedBoard => ({
  id: board.id,
  name: board.name,
  repos,
  unreadableRepos,
  columns: board.columns,
  hidden: board.hidden,
  version: board.version,
})
