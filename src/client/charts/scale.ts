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
