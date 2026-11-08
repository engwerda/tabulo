import { fuzzyMatch, fuzzyMatchFields } from "./fuzzy.ts"

/** What the palette can match a query against. */
export type Searchable = {
  readonly id: string
  readonly title: string
  readonly subtitle?: string | undefined
  /** Matched but never shown, so "theme" finds "Dark". */
  readonly keywords?: string | undefined
  /** The id of an item in another group that this one repeats; it is left out when that one shows. */
  readonly sameAs?: string | undefined
}

export type GroupSpec<T> = {
  readonly id: string
  readonly heading: string
  readonly items: ReadonlyArray<T>
  /** Items shown while a query is typed. */
  readonly limit: number
  /** Items shown while the query is empty; 0 hides the group. */
  readonly emptyLimit: number
  /**
   * `true` keeps only the items that match the query. `false` keeps them all, for items the
   * server already searched, and shows the group even when it has no items.
   */
  readonly filter: boolean
}

export type Row<T> = {
  readonly item: T
  readonly titleIndices: ReadonlyArray<number>
  readonly subtitleIndices: ReadonlyArray<number>
}

export type Section<T> = {
  readonly id: string
  readonly heading: string
  readonly rows: ReadonlyArray<Row<T>>
}

const RECENT_LIMIT = 5
const none: ReadonlyArray<number> = []

const plainRow = <T extends Searchable>(item: T): Row<T> => ({
  item,
  titleIndices: none,
  subtitleIndices: none,
})

const highlightedRow = <T extends Searchable>(query: string, item: T): Row<T> => ({
  item,
  titleIndices: fuzzyMatch(query, item.title)?.indices ?? none,
  subtitleIndices:
    item.subtitle === undefined ? none : (fuzzyMatch(query, item.subtitle)?.indices ?? none),
})

/**
 * Lays out the palette. With no query it shows the recently used items first and then each
 * group's first items. With a query it ranks each group, and puts the group with the best
 * match first.
 */
export const rankSections = <T extends Searchable>(
  query: string,
  groups: ReadonlyArray<GroupSpec<T>>,
  recentIds: ReadonlyArray<string>,
): ReadonlyArray<Section<T>> => {
  if (query.trim() === "") {
    const byId = new Map(groups.flatMap((group) => group.items.map((item) => [item.id, item])))
    const recent = recentIds.flatMap((id) => byId.get(id) ?? []).slice(0, RECENT_LIMIT)
    const taken = new Set(recent.map((item) => item.id))
    const sections: Array<Section<T>> = []
    if (recent.length > 0) {
      sections.push({ id: "recent", heading: "Recent", rows: recent.map(plainRow) })
    }
    for (const group of groups) {
      const items = group.items.filter((item) => !taken.has(item.id)).slice(0, group.emptyLimit)
      if (items.length > 0)
        sections.push({ id: group.id, heading: group.heading, rows: items.map(plainRow) })
    }
    return sections
  }

  const local = groups.flatMap((group, order) => {
    if (!group.filter) return []
    const scored = group.items.flatMap((item) => {
      const match = fuzzyMatchFields(query, [item.title, item.subtitle ?? "", item.keywords ?? ""])
      if (match === null) return []
      const [titleIndices = none, subtitleIndices = none] = match.indices
      return [{ score: match.score, row: { item, titleIndices, subtitleIndices } }]
    })
    if (scored.length === 0) return []
    scored.sort((a, b) => b.score - a.score)
    const rows = scored.slice(0, group.limit).map(({ row }) => row)
    return [
      {
        order,
        best: scored[0]?.score ?? 0,
        section: { id: group.id, heading: group.heading, rows },
      },
    ]
  })
  local.sort((a, b) => b.best - a.best || a.order - b.order)
  const shown = new Set(local.flatMap((entry) => entry.section.rows.map((row) => row.item.id)))
  // Server results come last and keep every item the server returned, except repeats of a row
  // already shown above.
  const remote = groups.flatMap((group) => {
    if (group.filter) return []
    const rows = group.items
      .filter((item) => item.sameAs === undefined || !shown.has(item.sameAs))
      .slice(0, group.limit)
      .map((item) => highlightedRow(query, item))
    return [{ id: group.id, heading: group.heading, rows }]
  })
  return [...local.map((entry) => entry.section), ...remote]
}
