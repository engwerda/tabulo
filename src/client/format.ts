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

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

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

const REPO_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
]

/** A stable color per repository name, so a repository reads the same on every card. */
export const repoColor = (name: string) => {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return REPO_COLORS[hash % REPO_COLORS.length] ?? "#6366f1"
}
