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

/** Distinct hues, ordered so that neighbours in the list never look alike. */
export const REPO_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#0ea5e9",
  "#f97316",
  "#8b5cf6",
  "#84cc16",
  "#ef4444",
  "#14b8a6",
]

const hueIndex = (name: string) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % REPO_COLORS.length
}

/** A stable color per name, for avatars and repositories outside a board's palette. */
export const repoColor = (name: string) => REPO_COLORS[hueIndex(name)] ?? "#6366f1"

/**
 * The hue `repoColor` gives a name, dark enough (600 or 700) that white initials on it pass
 * WCAG AA at small sizes.
 */
const AVATAR_FILLS = [
  "#4f46e5",
  "#b45309",
  "#047857",
  "#be185d",
  "#0369a1",
  "#c2410c",
  "#7c3aed",
  "#4d7c0f",
  "#b91c1c",
  "#0f766e",
]

export const avatarFill = (name: string) => AVATAR_FILLS[hueIndex(name)] ?? "#4f46e5"
