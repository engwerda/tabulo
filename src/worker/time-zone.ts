export const DAY_MS = 24 * 60 * 60 * 1000

/** An instant's calendar date, weekday, and hour in one time zone. */
export type ZonedTime = {
  /** `YYYY-MM-DD`. */
  readonly date: string
  /** 0 is Monday. */
  readonly weekday: number
  readonly hour: number
}

/** Whether `name` is an IANA time zone that this runtime knows. */
export const isTimeZone = (name: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name })
    return true
  } catch {
    return false
  }
}

/** Reads instants (epoch milliseconds) as calendar times in `timeZone`. */
export const zonedTime = (timeZone: string) => {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  })
  /** The zone's UTC offset at `millis`, in milliseconds. */
  const offsetAt = (millis: number) => {
    const parts = Object.fromEntries(
      format.formatToParts(millis).map((part) => [part.type, Number(part.value)] as const),
    )
    const local = Date.UTC(
      parts.year ?? 0,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
    )
    return local - Math.floor(millis / 60_000) * 60_000
  }
  // formatToParts is slow next to the rest of an aggregation, and an offset changes at most
  // once a day: a UTC day whose offset is the same at both ends has that offset throughout.
  const dayOffsets = new Map<number, number | null>()
  const offsetFor = (millis: number) => {
    const day = Math.floor(millis / DAY_MS)
    let offset = dayOffsets.get(day)
    if (offset === undefined) {
      const start = offsetAt(day * DAY_MS)
      offset = start === offsetAt((day + 1) * DAY_MS - 1) ? start : null
      dayOffsets.set(day, offset)
    }
    return offset ?? offsetAt(millis)
  }
  return (millis: number): ZonedTime => {
    const local = new Date(millis + offsetFor(millis))
    return {
      date: local.toISOString().slice(0, 10),
      weekday: (local.getUTCDay() + 6) % 7,
      hour: local.getUTCHours(),
    }
  }
}

/** Calendar arithmetic on `YYYY-MM-DD` dates, which has no daylight saving time. */
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** The Monday of the week that contains `time`. */
export const weekStart = (time: ZonedTime) => addDays(time.date, -time.weekday)
