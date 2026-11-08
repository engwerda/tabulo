import { formatDay } from "../charts/scale.ts"

/** How a weekly chart groups its weeks: one column per week, or per calendar month. */
export type Grain = "week" | "month"

/** One column of a weekly chart: a week, or the weeks whose Monday falls in one month. */
export type TimeBucket = {
  /** The week's Monday, or the month as `YYYY-MM`. */
  readonly key: string
  /** The axis label: "Nov 3" for a week, "Nov" for a month. */
  readonly label: string
  /**
   * The tooltip title and table row: "Week of Nov 3, 2025" or "Nov 2025", with a week's year
   * when the range spans two.
   */
  readonly title: string
  /** Holds the current week, which is still in progress. */
  readonly partial: boolean
  /** Indexes of the bucket's weeks in the weekly series. */
  readonly weeks: ReadonlyArray<number>
}

const monthFormat = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })
const monthOf = (date: string) => monthFormat.format(new Date(`${date}T00:00:00Z`))

/** Whether the dates span more than one calendar year, so a date needs its year to be clear. */
export const spansYears = (dates: ReadonlyArray<string>) =>
  (dates[0] ?? "").slice(0, 4) !== (dates.at(-1) ?? "").slice(0, 4)

/** `YYYY-MM-DD` as "Nov 3", or "Nov 3, 2025" when `withYear`. */
export const formatDate = (date: string, withYear: boolean) =>
  withYear ? `${formatDay(date)}, ${date.slice(0, 4)}` : formatDay(date)

/** The columns for weeks starting on `weekStarts`; the last week is the current one. */
export const timeBuckets = (
  weekStarts: ReadonlyArray<string>,
  grain: Grain,
): ReadonlyArray<TimeBucket> => {
  const withYear = spansYears(weekStarts)
  const last = weekStarts.length - 1
  if (grain === "week") {
    return weekStarts.map((week, index) => ({
      key: week,
      label: formatDay(week),
      title: `Week of ${formatDate(week, withYear)}${index === last ? ", so far" : ""}`,
      partial: index === last,
      weeks: [index],
    }))
  }
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
      title: `${monthOf(first)} ${month.slice(0, 4)}${from}${partial ? ", so far" : ""}`,
      partial,
      weeks,
    }
  })
}

/** A weekly series summed into the buckets' columns. */
export const bucketTotals = (buckets: ReadonlyArray<TimeBucket>, values: ReadonlyArray<number>) =>
  buckets.map((bucket) => bucket.weeks.reduce((total, week) => total + (values[week] ?? 0), 0))
