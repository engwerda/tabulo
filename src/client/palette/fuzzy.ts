export type FuzzyMatch = {
  /** Higher is better; comparable only between matches of the same query. */
  readonly score: number
  /**
   * The score without the cost of starting late in the text, so two matches of a word's start
   * are equal wherever the word sits.
   */
  readonly quality: number
  /** Indices into the text of the characters that matched, ascending. */
  readonly indices: ReadonlyArray<number>
}

const MATCH = 1
const CONSECUTIVE = 6
const WORD_START = 5
const TEXT_START = 4
const GAP = 0.15
const LEADING = 0.3
const MAX_LEADING = 10
const NONE = Number.NEGATIVE_INFINITY

const isWordChar = (char: string) => /[\p{L}\p{N}]/u.test(char)

const isWordStart = (text: string, index: number) => {
  if (index === 0) return true
  const previous = text.charAt(index - 1)
  const current = text.charAt(index)
  return (
    !isWordChar(previous) ||
    (previous === previous.toLowerCase() && current !== current.toLowerCase())
  )
}

/** Terms this long or longer match only in runs of two or more characters, or at word starts. */
const STRICT_LENGTH = 3
// A placement's last matched character either ends a sound run (VALID) or is a lone character
// inside a word (LONE), which only a following adjacent match can redeem.
const VALID = 0
const LONE = 1
type State = typeof VALID | typeof LONE

/**
 * Matches one term as a subsequence, choosing the placement with the best score. A term of
 * `STRICT_LENGTH` or more characters rejects a placement with a lone character inside a word, so
 * "cache" does not match the scattered letters of "public search endpoint".
 */
const matchTerm = (term: string, text: string): FuzzyMatch | null => {
  const lowerTerm = Array.from(term, (char) => char.toLowerCase())
  const lowerText = Array.from(text, (char) => char.toLowerCase())
  const n = lowerText.length
  const m = lowerTerm.length
  if (m > n) return null
  const strict = m >= STRICT_LENGTH

  // score[state][i][j]: best score with term character i matched at text character j, ending in
  // `state`. from[state][i][j] encodes the previous cell as `j * 2 + state`.
  const score: [number[][], number[][]] = [[], []]
  const from: [number[][], number[][]] = [[], []]
  for (let i = 0; i < m; i++) {
    const rows: [number[], number[]] = [new Array(n).fill(NONE), new Array(n).fill(NONE)]
    const backs: [number[], number[]] = [new Array(n).fill(-1), new Array(n).fill(-1)]
    const previousValid = score[VALID][i - 1]
    const previousLone = score[LONE][i - 1]
    // Best earlier sound match that skips at least one character, with the gap already charged.
    let gapped = NONE
    let gappedAt = -1
    for (let j = 0; j < n; j++) {
      if (previousValid !== undefined && j >= 2) {
        gapped -= GAP
        const candidate = previousValid[j - 2] ?? NONE
        if (candidate >= gapped) {
          gapped = candidate
          gappedAt = j - 2
        }
      }
      if (lowerText[j] !== lowerTerm[i]) continue
      const wordStart = isWordStart(text, j)
      const own = MATCH + (wordStart ? WORD_START : 0) + (j === 0 ? TEXT_START : 0)
      const landing: State = wordStart || !strict ? VALID : LONE
      if (previousValid === undefined || previousLone === undefined) {
        rows[landing][j] = own - LEADING * Math.min(j, MAX_LEADING)
        continue
      }
      const afterValid = j >= 1 ? (previousValid[j - 1] ?? NONE) : NONE
      const afterLone = j >= 1 ? (previousLone[j - 1] ?? NONE) : NONE
      const adjacent = Math.max(afterValid, afterLone) + CONSECUTIVE
      if (adjacent > NONE) {
        rows[VALID][j] = adjacent + own
        backs[VALID][j] = (j - 1) * 2 + (afterValid >= afterLone ? VALID : LONE)
      }
      if (gapped > NONE && gapped + own > (rows[landing][j] ?? NONE)) {
        rows[landing][j] = gapped + own
        backs[landing][j] = gappedAt * 2 + VALID
      }
    }
    for (const state of [VALID, LONE] as const) {
      score[state].push(rows[state])
      from[state].push(backs[state])
    }
  }

  const last = score[VALID][m - 1] ?? []
  let end = -1
  for (let j = 0; j < n; j++) {
    if (end === -1 || (last[j] ?? NONE) > (last[end] ?? NONE)) end = j
  }
  if (end === -1 || (last[end] ?? NONE) === NONE) return null
  const indices: number[] = []
  let state: State = VALID
  for (let i = m - 1, j = end; i >= 0; i--) {
    indices.unshift(j)
    const code = from[state][i]?.[j] ?? -1
    j = code >> 1
    state = (code & 1) as State
  }
  const total = last[end] ?? 0
  return {
    score: total,
    quality: total + LEADING * Math.min(indices[0] ?? 0, MAX_LEADING),
    indices,
  }
}

/**
 * Matches every space-separated term of `query` as a subsequence of `text`, ignoring case.
 * Matches that start the text or a word, and runs of adjacent characters, score higher; a term
 * of three or more characters matches only in such runs or at word starts. An empty query
 * matches everything with score 0; no match is `null`.
 */
export const fuzzyMatch = (query: string, text: string): FuzzyMatch | null => {
  const terms = query.split(/\s+/).filter((term) => term !== "")
  if (terms.length === 0) return { score: 0, quality: 0, indices: [] }
  let total = 0
  let quality = 0
  const indices = new Set<number>()
  for (const term of terms) {
    const match = matchTerm(term, text)
    if (match === null) return null
    total += match.score
    quality += match.quality
    for (const index of match.indices) indices.add(index)
  }
  return { score: total, quality, indices: [...indices].sort((a, b) => a - b) }
}

/** Later fields count for less, so a title match beats a subtitle or keyword match. */
const FIELD_WEIGHT = 0.6

export type FieldsMatch = {
  readonly score: number
  readonly quality: number
  /** Matched character indices per field, in the order of `fields`. */
  readonly indices: ReadonlyArray<ReadonlyArray<number>>
}

type Placement = { readonly score: number; readonly field: number; readonly match: FuzzyMatch }

/**
 * Matches each space-separated term of `query` against the field it fits best, so that
 * "acme board" finds a Board entry of acme whose title and subtitle are separate fields.
 */
export const fuzzyMatchFields = (
  query: string,
  fields: ReadonlyArray<string>,
  /**
   * The last field holds hidden keywords, which match only as a word's beginning: with no
   * highlight to show why, a scattered match there would look like noise.
   */
  { hiddenLast = false }: { readonly hiddenLast?: boolean } = {},
): FieldsMatch | null => {
  const terms = query.split(/\s+/).filter((term) => term !== "")
  const indices = fields.map(() => new Set<number>())
  let total = 0
  let quality = 0
  for (const term of terms) {
    let best: Placement | null = null
    for (const [field, text] of fields.entries()) {
      const hidden = hiddenLast && field === fields.length - 1
      if (
        hidden &&
        !text
          .toLowerCase()
          .split(/\s+/)
          .some((word) => word.startsWith(term.toLowerCase()))
      ) {
        continue
      }
      const match = fuzzyMatch(term, text)
      if (match === null) continue
      const score = match.score * FIELD_WEIGHT ** field
      if (best === null || score > best.score) best = { score, field, match }
    }
    if (best === null) return null
    total += best.score
    quality += best.match.quality * FIELD_WEIGHT ** best.field
    for (const index of best.match.indices) indices[best.field]?.add(index)
  }
  return { score: total, quality, indices: indices.map((set) => [...set].sort((a, b) => a - b)) }
}
