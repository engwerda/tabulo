const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

export const relativeTime = (iso: string, now: number = Date.now()) => {
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return "just now"
}

export const absoluteTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

/** "Ada Lovelace" gives "AL"; a single word such as a login gives its first two letters. */
export const initials = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    const word = parts[0] ?? ""
    return `${word.slice(0, 1).toUpperCase()}${word.slice(1, 2).toLowerCase()}`
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

const SHORT_UNITS: ReadonlyArray<[string, number]> = [
  ["y", 365 * 24 * 3600],
  ["mo", 30 * 24 * 3600],
  ["w", 7 * 24 * 3600],
  ["d", 24 * 3600],
  ["h", 3600],
  ["m", 60],
]

/** "3d", "5h": a compact age for dense places such as card footers. */
export const shortAge = (iso: string, now: number = Date.now()) => {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  for (const [unit, size] of SHORT_UNITS) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${unit}`
  }
  return "now"
}

/**
 * Distinct hues, ordered so that neighbours in the list never look alike. The first ones stay
 * clear of the board's status colors (grey, red, amber, violet, green), so a repository's mark
 * never reads as a column.
 */
export const REPO_COLORS = [
  "#0ea5e9",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#d946ef",
  "#06b6d4",
  "#64748b",
  "#84cc16",
  "#f97316",
  "#f43f5e",
]

const hueIndex = (name: string) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % REPO_COLORS.length
}

/** A stable color per name, for avatars and repositories outside a board's palette. */
export const repoColor = (name: string) => REPO_COLORS[hueIndex(name)] ?? "#0ea5e9"

/**
 * The hue `repoColor` gives a name, dark enough (600 or 700) that white initials on it pass
 * WCAG AA at small sizes.
 */
const AVATAR_FILLS = [
  "#0369a1",
  "#be185d",
  "#0f766e",
  "#4f46e5",
  "#a21caf",
  "#0e7490",
  "#475569",
  "#4d7c0f",
  "#c2410c",
  "#be123c",
]

export const avatarFill = (name: string) => AVATAR_FILLS[hueIndex(name)] ?? "#0369a1"
