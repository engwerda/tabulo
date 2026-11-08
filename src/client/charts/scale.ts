/** A linear map from a data domain to a pixel range. */
export const linearScale =
  ([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]) =>
  (value: number) =>
    d1 === d0 ? r0 : r0 + ((value - d0) / (d1 - d0)) * (r1 - r0)

/**
 * Round tick values from 0 up to at least `max`, about `target` steps apart: steps of 1, 2, or 5
 * times a power of ten, and never below 1 for counts.
 */
export const niceTicks = (max: number, target = 4, { integer = true } = {}) => {
  if (!(max > 0)) return [0, 1]
  const raw = max / target
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  let step = (fraction >= 7.5 ? 10 : fraction >= 3.5 ? 5 : fraction >= 1.5 ? 2 : 1) * power
  if (integer) step = Math.max(1, Math.round(step))
  const top = Math.ceil(max / step) * step
  const ticks: Array<number> = []
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(Number(tick.toFixed(10)))
  return ticks
}

const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const fullFormat = new Intl.NumberFormat("en")

/** 1,284 in full below 10,000, then 12.9K. */
export const formatCount = (value: number) =>
  Math.abs(value) < 10_000 ? fullFormat.format(value) : compactFormat.format(value)

const round1 = (value: number) => Math.round(value * 10) / 10

export const formatHours = (hours: number) =>
  hours < 1
    ? `${Math.round(hours * 60)}m`
    : hours < 48
      ? `${round1(hours)}h`
      : `${round1(hours / 24)}d`

export const formatMinutes = (minutes: number) =>
  minutes < 1
    ? `${Math.round(minutes * 60)}s`
    : minutes < 90
      ? `${round1(minutes)}m`
      : formatHours(minutes / 60)

export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`

const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
const longDayFormat = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** `YYYY-MM-DD` as "Nov 2". The date has no time zone, so it is read as UTC. */
export const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`))
export const formatLongDay = (date: string) => longDayFormat.format(new Date(`${date}T00:00:00Z`))

/** Two `YYYY-MM-DD` dates as "Oct 5 to Nov 7, 2026", with both years when they differ. */
export const formatSpan = (start: string, end: string) => {
  const [startYear, endYear] = [start.slice(0, 4), end.slice(0, 4)]
  return startYear === endYear
    ? `${formatDay(start)} to ${formatDay(end)}, ${endYear}`
    : `${formatDay(start)}, ${startYear} to ${formatDay(end)}, ${endYear}`
}

/** How a change against an earlier value reads: a percentage, a count, or percentage points. */
export type ChangeMode = "percent" | "absolute" | "points"

// Below this earlier value a percentage overstates the change ("+2600%" from 3 to 81).
const PERCENT_MIN_BASE = 10

/**
 * The change from `previous` to `value` with its sign: "+12%", "−4" in the value's own `format`,
 * or "+3 pts" for ratios. A percentage falls back to the difference when the earlier value is
 * under 10, and then names that value ("+100 from 7") so it does not read as a percentage.
 */
export const formatChange = (
  value: number,
  previous: number,
  mode: ChangeMode,
  format: (value: number) => string = formatCount,
) => {
  const change = value - previous
  const sign = change > 0 ? "+" : "−"
  if (mode === "points") {
    const points = Math.abs(Math.round(change * 100))
    return `${sign}${points} ${points === 1 ? "pt" : "pts"}`
  }
  if (mode === "absolute") return `${sign}${format(Math.abs(change))}`
  if (Math.abs(previous) >= PERCENT_MIN_BASE) {
    return `${sign}${Math.abs(Math.round((change / previous) * 100))}%`
  }
  return `${sign}${format(Math.abs(change))} from ${format(previous)}`
}
