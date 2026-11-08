import { INSIGHT_GRAIN, type InsightDays, type InsightGrain } from "../../shared/api.ts"
import { formatDay } from "../charts/scale.ts"

/** What a chart's columns count: one period of the payload's grain, or the weeks of a month. */
export type ColumnGrain = InsightGrain | "month"

/** How a grain reads in the page's copy. */
export const GRAIN_WORDS: Record<
  InsightGrain,
  {
    readonly one: string
    readonly many: string
    readonly adjective: string
    /** Where the window of `days` starts, as the page header explains it. */
    readonly windowFrom: (days: InsightDays) => string
  }
> = {
  hour: {
    one: "hour",
    many: "hours",
    adjective: "Hourly",
    windowFrom: (days) => `the start of the hour ${days * 24} hours ago`,
  },
  day: {
    one: "day",
    many: "days",
    adjective: "Daily",
    windowFrom: (days) => `the start of the day ${days} days ago`,
  },
  week: {
    one: "week",
    many: "weeks",
    adjective: "Weekly",
    windowFrom: (days) => `the Monday of the week ${days} days ago`,
  },
}

/** Where the window of `days` starts and why, for the page header. */
export const windowNote = (days: InsightDays) => {
  const words = GRAIN_WORDS[INSIGHT_GRAIN[days]]
  return `From ${words.windowFrom(days)}, so every ${words.one} is whole`
}

/** How a chart's columns read: in a table caption, as its column header, and in its legend. */
export const COLUMN_WORDS: Record<
  ColumnGrain,
  { readonly one: string; readonly header: string; readonly legend: string }
> = {
  hour: { one: "hour", header: "Hour", legend: "Per hour" },
  day: { one: "day", header: "Day", legend: "Per day" },
  week: { one: "week", header: "Week", legend: "Per week" },
  month: { one: "month", header: "Month", legend: "Weeks grouped by month" },
}

/** One column of a chart over time: a period, or the weeks whose Monday falls in one month. */
export type TimeBucket = {
  /** The period's start, or the month as `YYYY-MM`. */
  readonly key: string
  /**
   * The axis label: "09:00" for an hour, "Nov 3" for a day or a week, "Nov" for a month, with
   * "’25" where a range that spans two years needs it.
   */
  readonly label: string
  /**
   * The tooltip title and table row: "Nov 7, 09:00", "Sat, Nov 7", "Week of Nov 3, 2025", or
   * "Nov 2025", with a date's year when the range spans two.
   */
  readonly title: string
  /** Holds the current period, which is still in progress. */
  readonly partial: boolean
  /** Indexes of the bucket's periods in the series. */
  readonly periods: ReadonlyArray<number>
}

const monthFormat = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })
const monthOf = (date: string) => monthFormat.format(new Date(`${date}T00:00:00Z`))
const weekdayFormat = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" })

/** An hour's start (an ISO instant) as "09:00" in `tz`. */
const hourLabel = (tz: string) => {
  const format = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  })
  return (start: string) => format.format(Date.parse(start))
}

/** An hour's start (an ISO instant) as "Nov 7, 09:00" in `tz`. */
export const hourTitle = (tz: string) => {
  const format = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  })
  return (start: string) => format.format(Date.parse(start))
}

/** Whether the dates span more than one calendar year, so a date needs its year to be clear. */
export const spansYears = (dates: ReadonlyArray<string>) =>
  (dates[0] ?? "").slice(0, 4) !== (dates.at(-1) ?? "").slice(0, 4)

/** `YYYY-MM-DD` as "Nov 3", or "Nov 3, 2025" when `withYear`. */
export const formatDate = (date: string, withYear: boolean) =>
  withYear ? `${formatDay(date)}, ${date.slice(0, 4)}` : formatDay(date)

/**
 * `YYYY-MM-DD`, one of `dates`, as an axis label: "Nov 3", or "Nov 3 ’25" when the dates span two
 * years and it falls in the earlier one or in January. Unlike a month, a week is marked whenever
 * it is in the earlier year, since the axis shows only the labels it has room for.
 */
export const axisDay = (date: string, dates: ReadonlyArray<string>) =>
  spansYears(dates) &&
  (date.slice(0, 4) !== (dates.at(-1) ?? "").slice(0, 4) || date.slice(5, 7) === "01")
    ? `${formatDay(date)} ’${date.slice(2, 4)}`
    : formatDay(date)

/** The axis label and title of each period starting on `starts`, without "so far". */
const periodNames = (
  starts: ReadonlyArray<string>,
  grain: InsightGrain,
  tz: string,
): { label: (start: string) => string; title: (start: string) => string } => {
  const withYear = spansYears(starts)
  switch (grain) {
    case "hour":
      return { label: hourLabel(tz), title: hourTitle(tz) }
    case "day":
      return {
        label: (date) => axisDay(date, starts),
        title: (date) =>
          `${weekdayFormat.format(new Date(`${date}T00:00:00Z`))}, ${formatDate(date, withYear)}`,
      }
    case "week":
      return {
        label: (week) => axisDay(week, starts),
        title: (week) => `Week of ${formatDate(week, withYear)}`,
      }
  }
}

/** The weeks starting on `weekStarts` grouped into calendar months. */
const monthBuckets = (weekStarts: ReadonlyArray<string>): ReadonlyArray<TimeBucket> => {
  const withYear = spansYears(weekStarts)
  const last = weekStarts.length - 1
  const months = new Map<string, Array<number>>()
  weekStarts.forEach((week, index) => {
    const month = week.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), index])
  })
  return [...months].map(([month, weeks]) => {
    const first = weekStarts[weeks[0] ?? 0] ?? ""
    const partial = weeks.includes(last)
    // The window can open on a Monday late in its first month.
    const from = weeks[0] === 0 && Number(first.slice(8)) > 7 ? `, from ${formatDay(first)}` : ""
    return {
      key: month,
      label:
        withYear && (month.endsWith("-01") || month === weekStarts[0]?.slice(0, 7))
          ? `${monthOf(first)} ’${month.slice(2, 4)}`
          : monthOf(first),
      // Weeks are never split, so a month holds the weeks that start in it, and says so.
      title: `Weeks starting in ${monthOf(first)} ${month.slice(0, 4)}${from}${partial ? ", so far" : ""}`,
      partial,
      periods: weeks,
    }
  })
}

/**
 * The columns for the periods starting on `starts`, the series' `start` values in the time zone
 * `tz`; the last period is the current one. A month column holds weeks.
 */
export const timeBuckets = (
  starts: ReadonlyArray<string>,
  column: ColumnGrain,
  tz: string,
): ReadonlyArray<TimeBucket> => {
  if (column === "month") return monthBuckets(starts)
  const { label, title } = periodNames(starts, column, tz)
  const last = starts.length - 1
  return starts.map((start, index) => ({
    key: start,
    label: label(start),
    title: `${title(start)}${index === last ? ", so far" : ""}`,
    partial: index === last,
    periods: [index],
  }))
}

/** A series summed into the buckets' columns. */
export const bucketTotals = (buckets: ReadonlyArray<TimeBucket>, values: ReadonlyArray<number>) =>
  buckets.map((bucket) =>
    bucket.periods.reduce((total, period) => total + (values[period] ?? 0), 0),
  )

/**
 * The axis labels and titles of a chart's points at the start of each period, then one at now,
 * the last day of the window `end`. A day or week point is titled with its date, an hour point
 * with its date and hour. Days and hours label the last point "Now", since the current period
 * already names today or this hour.
 */
export const periodPoints = (
  starts: ReadonlyArray<string>,
  grain: InsightGrain,
  tz: string,
  end: string,
): { readonly labels: ReadonlyArray<string>; readonly titles: ReadonlyArray<string> } => {
  if (grain === "hour") {
    return {
      labels: [...starts.map(hourLabel(tz)), "Now"],
      titles: [...starts.map(hourTitle(tz)), "Now"],
    }
  }
  const dates = [...starts, end]
  const withYear = spansYears(dates)
  return {
    labels: [
      ...starts.map((date) => axisDay(date, dates)),
      grain === "week" ? axisDay(end, dates) : "Now",
    ],
    titles: [...starts.map((date) => formatDate(date, withYear)), "Now"],
  }
}
