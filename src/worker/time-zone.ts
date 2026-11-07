export const DAY_MS = 24 * 60 * 60 * 1000

/** An instant's calendar date, weekday, and hour in one time zone. */
export type ZonedTime = {
  /** `YYYY-MM-DD`. */
  readonly date: string
  /** 0 is Monday. */
  readonly weekday: number
  readonly hour: number
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Whether `name` is an IANA time zone that this runtime knows. */
export const isTimeZone = (name: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name })
    return true
  } catch {
    return false
  }
}

// Every UTC offset is a whole number of quarter hours, so all instants in one UTC quarter hour
// share a local date and hour.
const QUARTER_HOUR_MS = 15 * 60 * 1000

/** Reads instants (epoch milliseconds) as calendar times in `timeZone`. */
export const zonedTime = (timeZone: string) => {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  })
  // formatToParts is slow next to the rest of an aggregation, and events cluster in time.
  const cache = new Map<number, ZonedTime>()
  return (millis: number): ZonedTime => {
    const slot = Math.floor(millis / QUARTER_HOUR_MS)
    const cached = cache.get(slot)
    if (cached !== undefined) return cached
    const parts = Object.fromEntries(
      format.formatToParts(slot * QUARTER_HOUR_MS).map((part) => [part.type, part.value] as const),
    )
    const time = {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
      hour: Number(parts.hour),
    }
    cache.set(slot, time)
    return time
  }
}

/** Calendar arithmetic on `YYYY-MM-DD` dates, which has no daylight saving time. */
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** The Monday of the week that contains `time`. */
export const weekStart = (time: ZonedTime) => addDays(time.date, -time.weekday)
