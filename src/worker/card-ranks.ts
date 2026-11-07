import { Array as Arr, Clock, Context, Effect } from "effect"
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing"

export type StoredRank = { readonly column: string; readonly rank: string }
export type RankUpdate = { readonly key: string; readonly rank: string }

/** Card order within board columns, shared by everyone who sees the organization's board. */
export class CardRanks extends Context.Service<
  CardRanks,
  {
    /** Every stored rank of the organization, by card key. */
    readonly forOrg: (org: string) => Effect.Effect<ReadonlyMap<string, StoredRank>>
    readonly write: (
      org: string,
      column: string,
      updates: ReadonlyArray<RankUpdate>,
      updatedBy: string,
    ) => Effect.Effect<void>
  }
>()("tabulo/CardRanks") {}

/**
 * The rank rows to write so that `orderedKeys` sorts in that order once `movedKey` is placed.
 * When the moved card's neighbours are ranked, only the moved card gets a new rank between
 * them; otherwise the whole column is ranked afresh. `ranked` holds the column's stored ranks.
 */
export const planRanks = (
  orderedKeys: ReadonlyArray<string>,
  movedKey: string,
  ranked: ReadonlyMap<string, string>,
): ReadonlyArray<RankUpdate> => {
  const index = orderedKeys.indexOf(movedKey)
  const neighbourRank = (key: string | undefined) => (key === undefined ? null : ranked.get(key))
  const lower = neighbourRank(orderedKeys[index - 1])
  const upper = neighbourRank(orderedKeys[index + 1])
  if (
    lower !== undefined &&
    upper !== undefined &&
    (lower === null || upper === null || lower < upper)
  ) {
    return [{ key: movedKey, rank: generateKeyBetween(lower, upper) }]
  }
  return Arr.zip(orderedKeys, generateNKeysBetween(null, null, orderedKeys.length)).map(
    ([key, rank]) => ({ key, rank }),
  )
}

type RankRow = { issue_key: string; column_key: string; rank: string }

// D1 failures are infrastructure faults, not domain outcomes, so they surface as defects.
const query = <A>(run: () => Promise<A>) => Effect.promise(run)

export const makeCardRanks = (db: D1Database): CardRanks["Service"] => ({
  forOrg: (org) =>
    query(() =>
      db
        .prepare("SELECT issue_key, column_key, rank FROM card_ranks WHERE org = ?")
        .bind(org)
        .all<RankRow>(),
    ).pipe(
      Effect.map(
        ({ results }) =>
          new Map(
            results.map((row) => [row.issue_key, { column: row.column_key, rank: row.rank }]),
          ),
      ),
    ),

  write: (org, column, updates, updatedBy) =>
    Effect.gen(function* () {
      if (updates.length === 0) return
      const now = yield* Clock.currentTimeMillis
      const upsert = db.prepare(
        `INSERT INTO card_ranks (org, issue_key, column_key, rank, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (org, issue_key) DO UPDATE SET column_key = excluded.column_key,
           rank = excluded.rank, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      yield* query(() =>
        db.batch(
          updates.map(({ key, rank }) => upsert.bind(org, key, column, rank, now, updatedBy)),
        ),
      )
    }),
})
