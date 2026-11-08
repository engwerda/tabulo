/** A card of the insights grid: one column wide, or two. */
export type Cell<T> = { readonly item: T; readonly span: 1 | 2 }

/** A row of the grid: one wide card beside a narrow one, or one to three narrow cards. */
export type Row<T> =
  | { readonly kind: "wide"; readonly cells: readonly [Cell<T>, Cell<T>] | readonly [Cell<T>] }
  | { readonly kind: "narrow"; readonly cells: ReadonlyArray<Cell<T>> }

/**
 * Packs cards in order into rows of a three-column grid that never leave a hole. A wide card
 * takes the next narrow card beside it. Narrow cards fill rows of up to three, and a lone narrow
 * card pulls the next narrow card forward rather than stand alone.
 */
export const packRows = <T>(cells: ReadonlyArray<Cell<T>>): ReadonlyArray<Row<T>> => {
  const queue = [...cells]
  const rows: Array<Row<T>> = []
  const takeNarrow = (from = 0) => {
    const index = queue.findIndex((cell, position) => position >= from && cell.span === 1)
    return index === -1 ? undefined : queue.splice(index, 1)[0]
  }
  while (queue.length > 0) {
    const first = queue.shift() as Cell<T>
    if (first.span === 2) {
      const beside = takeNarrow()
      rows.push({ kind: "wide", cells: beside === undefined ? [first] : [first, beside] })
      continue
    }
    const run = [first]
    while (run.length < 3 && queue[0]?.span === 1) run.push(queue.shift() as Cell<T>)
    if (run.length === 1) {
      const next = takeNarrow()
      if (next !== undefined) run.push(next)
    }
    rows.push({ kind: "narrow", cells: run })
  }
  return rows
}
