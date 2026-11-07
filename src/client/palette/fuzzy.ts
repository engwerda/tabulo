export type FuzzyMatch = {
  /** Higher is better; comparable only between matches of the same query. */
  readonly score: number
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

/** Matches one term as a subsequence, choosing the placement with the best score. */
const matchTerm = (term: string, text: string): FuzzyMatch | null => {
  const lowerTerm = Array.from(term, (char) => char.toLowerCase())
  const lowerText = Array.from(text, (char) => char.toLowerCase())
  const n = lowerText.length
  const m = lowerTerm.length
  if (m > n) return null

  // score[i][j]: best score with term character i matched at text character j.
  const score: number[][] = []
  const from: number[][] = []
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(n).fill(NONE)
    const back = new Array<number>(n).fill(-1)
    const previous = score[i - 1]
    // Best earlier match that skips at least one character, with the gap already charged.
    let gapped = NONE
    let gappedAt = -1
    for (let j = 0; j < n; j++) {
      if (previous !== undefined && j >= 2) {
        gapped -= GAP
        const candidate = previous[j - 2] ?? NONE
        if (candidate >= gapped) {
          gapped = candidate
          gappedAt = j - 2
        }
      }
      if (lowerText[j] !== lowerTerm[i]) continue
      const own = MATCH + (isWordStart(text, j) ? WORD_START : 0) + (j === 0 ? TEXT_START : 0)
      if (previous === undefined) {
        row[j] = own - LEADING * Math.min(j, MAX_LEADING)
        continue
      }
      const adjacent = j >= 1 ? (previous[j - 1] ?? NONE) + CONSECUTIVE : NONE
      if (adjacent >= gapped && adjacent > NONE) {
        row[j] = adjacent + own
        back[j] = j - 1
      } else if (gapped > NONE) {
        row[j] = gapped + own
        back[j] = gappedAt
      }
    }
    score.push(row)
    from.push(back)
  }

  const last = score[m - 1] ?? []
  let end = -1
  for (let j = 0; j < n; j++) {
    if (end === -1 || (last[j] ?? NONE) > (last[end] ?? NONE)) end = j
  }
  if (end === -1 || (last[end] ?? NONE) === NONE) return null
  const indices: number[] = []
  for (let i = m - 1, j = end; i >= 0; i--) {
    indices.unshift(j)
    j = from[i]?.[j] ?? -1
  }
  return { score: last[end] ?? 0, indices }
}

/**
 * Matches every space-separated term of `query` as a subsequence of `text`, ignoring case.
 * Matches that start the text or a word, and runs of adjacent characters, score higher. An
 * empty query matches everything with score 0; no match is `null`.
 */
export const fuzzyMatch = (query: string, text: string): FuzzyMatch | null => {
  const terms = query.split(/\s+/).filter((term) => term !== "")
  if (terms.length === 0) return { score: 0, indices: [] }
  let total = 0
  const indices = new Set<number>()
  for (const term of terms) {
    const match = matchTerm(term, text)
    if (match === null) return null
    total += match.score
    for (const index of match.indices) indices.add(index)
  }
  return { score: total, indices: [...indices].sort((a, b) => a - b) }
}
