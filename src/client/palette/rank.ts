import { type FieldsMatch, fuzzyMatch, fuzzyMatchFields } from "./fuzzy.ts"

/** What the palette can match a query against. */
export type Searchable = {
  readonly id: string
  readonly title: string
  readonly subtitle?: string | undefined
  /** Matched but never shown, so "theme" finds "Dark". */
  readonly keywords?: string | undefined
  /**
   * Other names that the query may equal exactly, such as an issue's `#66`. An item whose title
   * or alias the query equals comes before every other match.
   */
  readonly aliases?: ReadonlyArray<string> | undefined
  /**
   * What the item is, for an item that several groups list, such as an issue that is both a board
   * card and your work: only the row of the earliest group in the list of groups shows.
   */
  readonly identity?: string | undefined
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
  /**
   * The page on screen's own commands: with no query they come before the recent items, and with
   * one they lead any group whose best match is no better, such as the page's filter values.
   */
  readonly contextual?: boolean
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
// Qualities add up fractions, so two equal matches may differ in the last bits.
const EPSILON = 1e-9

/** Negative when `a` matches better than `b`, ignoring where the match starts. */
const qualityOrder = (a: FieldsMatch, b: FieldsMatch) =>
  Math.abs(a.quality - b.quality) < EPSILON ? 0 : b.quality - a.quality

/** Negative when `a` is the better match: by quality, then by an earlier start. */
const compareMatches = (a: FieldsMatch, b: FieldsMatch) => qualityOrder(a, b) || b.score - a.score

type Scored<T> = { readonly row: Row<T>; readonly match: FieldsMatch; readonly exact: boolean }

/** Negative when `a` is the better match: an exact name first, then as `compareMatches`. */
const compareScored = <T>(a: Scored<T>, b: Scored<T>) =>
  Number(b.exact) - Number(a.exact) || compareMatches(a.match, b.match)

const isExact = (name: string, item: Searchable) =>
  [item.title, ...(item.aliases ?? [])].some((candidate) => candidate.toLowerCase() === name)

/**
 * Takes up to `limit` entries in order, leaving out any whose item's identity an entry taken
 * earlier, in this call or a previous one, already has.
 */
const identityFilter = () => {
  const claimed = new Set<string>()
  return <E>(entries: ReadonlyArray<E>, item: (entry: E) => Searchable, limit: number) => {
    const taken: Array<E> = []
    for (const entry of entries) {
      if (taken.length >= limit) break
      const { identity } = item(entry)
      if (identity !== undefined && claimed.has(identity)) continue
      if (identity !== undefined) claimed.add(identity)
      taken.push(entry)
    }
    return taken
  }
}

const itself = <T>(item: T) => item

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
 * Lays out the palette. With no query it shows the page's own commands first, then the recently
 * used items, and then each other group's first items. With a query it ranks each group, and puts the group with the best
 * match first.
 */
export const rankSections = <T extends Searchable>(
  query: string,
  groups: ReadonlyArray<GroupSpec<T>>,
  recentIds: ReadonlyArray<string>,
): ReadonlyArray<Section<T>> => {
  if (query.trim() === "") {
    const byId = new Map(groups.flatMap((group) => group.items.map((item) => [item.id, item])))
    const take = identityFilter()
    const recent = take(
      recentIds.flatMap((id) => byId.get(id) ?? []),
      itself,
      RECENT_LIMIT,
    )
    const taken = new Set(recent.map((item) => item.id))
    const firstItems = (group: GroupSpec<T>): ReadonlyArray<Section<T>> => {
      const items = take(
        group.items.filter((item) => !taken.has(item.id)),
        itself,
        group.emptyLimit,
      )
      return items.length === 0
        ? []
        : [{ id: group.id, heading: group.heading, rows: items.map(plainRow) }]
    }
    return [
      ...groups.filter((group) => group.contextual === true).flatMap(firstItems),
      ...(recent.length === 0
        ? []
        : [{ id: "recent", heading: "Recent", rows: recent.map(plainRow) }]),
      ...groups.filter((group) => group.contextual !== true).flatMap(firstItems),
    ]
  }

  const name = query.trim().toLowerCase()
  const take = identityFilter()
  const local = groups.flatMap((group, order) => {
    if (!group.filter) return []
    const scored = group.items.flatMap((item): ReadonlyArray<Scored<T>> => {
      const match = fuzzyMatchFields(
        query,
        [item.title, item.subtitle ?? "", item.keywords ?? ""],
        {
          hiddenLast: true,
        },
      )
      if (match === null) return []
      const [titleIndices = none, subtitleIndices = none] = match.indices
      return [{ match, exact: isExact(name, item), row: { item, titleIndices, subtitleIndices } }]
    })
    scored.sort(compareScored)
    const shown = take(scored, ({ row }) => row.item, group.limit)
    const best = shown[0]
    if (best === undefined) return []
    return [
      {
        order,
        best,
        contextual: group.contextual === true,
        section: { id: group.id, heading: group.heading, rows: shown.map(({ row }) => row) },
      },
    ]
  })
  // Groups go by how well their best item matches; where in a title the match sits only breaks
  // a tie after the page's own commands do.
  local.sort(
    (a, b) =>
      Number(b.best.exact) - Number(a.best.exact) ||
      qualityOrder(a.best.match, b.best.match) ||
      Number(b.contextual) - Number(a.contextual) ||
      compareMatches(a.best.match, b.best.match) ||
      a.order - b.order,
  )
  // Server results come last and keep every item the server returned, except repeats of a row
  // already shown above.
  const remote = groups.flatMap((group) => {
    if (group.filter) return []
    const rows = take(group.items, itself, group.limit).map((item) => highlightedRow(query, item))
    return [{ id: group.id, heading: group.heading, rows }]
  })
  return [...local.map((entry) => entry.section), ...remote]
}
