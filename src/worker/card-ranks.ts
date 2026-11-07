import { Array as Arr, Clock, Context, Effect } from "effect"
import { generateNKeysBetween } from "fractional-indexing"
import type { CardPlace } from "../shared/card-order.ts"

export type RankedCard = CardPlace & { readonly key: string }

/** Card order within board columns, shared by everyone who sees the organization's board. */
export class CardRanks extends Context.Service<
  CardRanks,
  {
    /** Every stored rank of the organization, by card key. */
    readonly forOrg: (org: string) => Effect.Effect<ReadonlyMap<string, CardPlace>>
    /**
     * In one batch, stores `ranked` for cards that have no row or a row for another column,
     * and deletes the rows of `removed`. A row that already names the card's column is kept,
     * so a concurrent reader or mover is not overwritten.
     */
    readonly materialize: (
      org: string,
      ranked: ReadonlyArray<RankedCard>,
      removed: ReadonlyArray<string>,
      updatedBy: string,
    ) => Effect.Effect<void>
    readonly place: (org: string, card: RankedCard, updatedBy: string) => Effect.Effect<void>
  }
>()("tabulo/CardRanks") {}

/**
 * Every card with its rank. `kept` are the cards whose stored rank is for their column. `fresh`
 * are the others, ranked after the largest stored rank of their column, most recently updated
 * first; they still need storing.
 */
export const rankCards = <
  C extends { readonly key: string; readonly column: string; readonly updatedAt: string },
>(
  stored: ReadonlyMap<string, CardPlace>,
  cards: ReadonlyArray<C>,
) => {
  const kept: Array<C & { readonly rank: string }> = []
  const unranked: Array<C> = []
  for (const card of cards) {
    const place = stored.get(card.key)
    if (place?.column === card.column) kept.push({ ...card, rank: place.rank })
    else unranked.push(card)
  }
  const fresh = Object.entries(Arr.groupBy(unranked, (card) => card.column)).flatMap(
    ([column, group]) => {
      let last: string | null = null
      for (const place of stored.values()) {
        if (place.column === column && (last === null || place.rank > last)) last = place.rank
      }
      const newestFirst = group.toSorted(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || (a.key < b.key ? -1 : 1),
      )
      return Arr.zip(newestFirst, generateNKeysBetween(last, null, newestFirst.length)).map(
        ([card, rank]) => ({ ...card, rank }),
      )
    },
  )
  return { kept, fresh }
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

  // One JSON parameter per statement keeps a board of any size within D1's limits on bound
  // parameters and statements per invocation.
  materialize: (org, ranked, removed, updatedBy) =>
    Effect.gen(function* () {
      const statements: Array<D1PreparedStatement> = []
      if (ranked.length > 0) {
        const now = yield* Clock.currentTimeMillis
        statements.push(
          db
            .prepare(
              `INSERT INTO card_ranks (org, issue_key, column_key, rank, updated_at, updated_by)
               SELECT ?1, json_extract(value, '$.key'), json_extract(value, '$.column'),
                 json_extract(value, '$.rank'), ?2, ?3
               FROM json_each(?4) WHERE true
               ON CONFLICT (org, issue_key) DO UPDATE SET column_key = excluded.column_key,
                 rank = excluded.rank, updated_at = excluded.updated_at,
                 updated_by = excluded.updated_by
               WHERE card_ranks.column_key <> excluded.column_key`,
            )
            .bind(org, now, updatedBy, JSON.stringify(ranked)),
        )
      }
      if (removed.length > 0) {
        statements.push(
          db
            .prepare(
              "DELETE FROM card_ranks WHERE org = ?1 AND issue_key IN (SELECT value FROM json_each(?2))",
            )
            .bind(org, JSON.stringify(removed)),
        )
      }
      if (statements.length > 0) yield* query(() => db.batch(statements))
    }),

  place: (org, card, updatedBy) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      yield* query(() =>
        db
          .prepare(
            `INSERT INTO card_ranks (org, issue_key, column_key, rank, updated_at, updated_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (org, issue_key) DO UPDATE SET column_key = excluded.column_key,
               rank = excluded.rank, updated_at = excluded.updated_at,
               updated_by = excluded.updated_by`,
          )
          .bind(org, card.key, card.column, card.rank, now, updatedBy)
          .run(),
      )
    }),
})
