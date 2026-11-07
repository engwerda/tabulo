import { generateKeyBetween } from "fractional-indexing"

/** A card's place on the board: its column and its rank within the column. */
export type CardPlace = { readonly column: string; readonly rank: string }

/**
 * Board order within a column: by rank, then by key. Ranks are fractional-indexing keys, which
 * sort by code unit, so localeCompare would misorder them. Concurrent writers can store equal
 * ranks, and the key keeps their order the same for everyone.
 */
export const compareCardOrder = (
  a: { readonly rank: string; readonly key: string },
  b: { readonly rank: string; readonly key: string },
) => {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/** Where a card is dropped: the cards shown directly above and below it, if any. */
export type CardDrop = {
  readonly movedKey: string
  readonly column: string
  readonly afterKey: string | null
  readonly beforeKey: string | null
}

/**
 * The rank that puts the moved card directly after `afterKey` in the column's order across the
 * whole organization, or at the top when `afterKey` is null. Cards the dropper cannot see keep
 * their places. Undefined when the neighbours do not match `places`: the dropper's board is
 * out of date.
 */
export const rankForDrop = (
  places: ReadonlyMap<string, CardPlace>,
  drop: CardDrop,
): string | undefined => {
  const neighbour = (key: string | null) => {
    if (key === null) return null
    const place = places.get(key)
    return place?.column === drop.column ? { key, rank: place.rank } : undefined
  }
  const after = neighbour(drop.afterKey)
  const before = neighbour(drop.beforeKey)
  if (after === undefined || before === undefined) return undefined
  if (after !== null && before !== null && compareCardOrder(before, after) <= 0) return undefined
  const lower = after?.rank ?? null
  let upper: string | null = null
  for (const [key, place] of places) {
    if (key === drop.movedKey || place.column !== drop.column) continue
    if (lower !== null && place.rank <= lower) continue
    if (upper === null || place.rank < upper) upper = place.rank
  }
  return generateKeyBetween(lower, upper)
}
