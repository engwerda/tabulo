import { describe, expect, it } from "vitest"
import { bucketTotals, periodPoints, timeBuckets } from "../src/client/insights/periods.ts"

// Dates name days in the payload's time zone already, so it must not move them.
const TZ = "Pacific/Auckland"
const HOUR = 60 * 60 * 1000
const WEEK = 7 * 24 * HOUR
const year: ReadonlyArray<string> = Array.from({ length: 53 }, (_, index) =>
  new Date(Date.parse("2025-11-03") + index * WEEK).toISOString().slice(0, 10),
)

describe("timeBuckets", () => {
  it("names each week, with the year when the range crosses one, and marks the last in progress", () => {
    const weeks = timeBuckets(year, "week", TZ)
    expect(weeks).toHaveLength(53)
    expect(weeks[0]?.title).toBe("Week of Nov 3, 2025")
    expect(weeks.at(-1)?.title).toBe("Week of Nov 2, 2026, so far")
    expect(timeBuckets(year.slice(-13), "week", TZ)[0]?.title).toBe("Week of Aug 10")
  })

  it("marks the year on week labels in the earlier year or in January, when the range spans two", () => {
    const labels = timeBuckets(year, "week", TZ).map((week) => week.label)
    expect(labels.slice(0, 2)).toEqual(["Nov 3 ’25", "Nov 10 ’25"])
    expect(labels[8]).toBe("Dec 29 ’25")
    expect(labels.slice(9, 14)).toEqual([
      "Jan 5 ’26",
      "Jan 12 ’26",
      "Jan 19 ’26",
      "Jan 26 ’26",
      "Feb 2",
    ])
    expect(labels.at(-1)).toBe("Nov 2")
    expect(timeBuckets(year.slice(-13), "week", TZ)[0]?.label).toBe("Aug 10")
    expect(timeBuckets(year.slice(10, 20), "week", TZ)[0]?.label).toBe("Jan 12")
  })

  it("groups a year of weeks into months, marking the year at the start and at January", () => {
    const months = timeBuckets(year, "month", TZ)
    expect(months.map((month) => month.label)).toEqual([
      "Nov ’25",
      "Dec",
      "Jan ’26",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
    ])
    expect(months[0]?.title).toBe("Weeks starting in Nov 2025")
    expect(months.at(-1)?.title).toBe("Weeks starting in Nov 2026, so far")
    expect(months.at(-1)?.partial).toBe(true)
    expect(months[0]?.partial).toBe(false)
    expect(timeBuckets(year.slice(3), "month", TZ)[0]?.title).toBe(
      "Weeks starting in Nov 2025, from Nov 24",
    )
  })

  it("puts every week in exactly one month and keeps the totals", () => {
    const months = timeBuckets(year, "month", TZ)
    expect(months.flatMap((month) => month.periods)).toHaveLength(53)
    expect(
      bucketTotals(
        months,
        year.map(() => 1),
      ).reduce((sum, count) => sum + count),
    ).toBe(53)
  })
})

describe("timeBuckets for hours and days", () => {
  // The 25 hours of a window that ends at 10:00 on Saturday 7 November in Amsterdam (UTC+01:00).
  const hours = Array.from({ length: 25 }, (_, index) =>
    new Date(Date.UTC(2026, 10, 6, 9) + index * HOUR).toISOString(),
  )

  it("names each hour by its local time and date, and marks the current one in progress", () => {
    const buckets = timeBuckets(hours, "hour", "Europe/Amsterdam")

    expect(buckets.map((bucket) => bucket.key)).toEqual(hours)
    expect(buckets[0]).toMatchObject({ label: "10:00", title: "Nov 6, 10:00", partial: false })
    expect(buckets[14]).toMatchObject({ label: "00:00", title: "Nov 7, 00:00" })
    expect(buckets.at(-1)).toMatchObject({
      label: "10:00",
      title: "Nov 7, 10:00, so far",
      partial: true,
    })
    expect(timeBuckets(hours, "hour", "Asia/Tokyo")[0]?.title).toBe("Nov 6, 18:00")
  })

  it("keeps apart the two hours that a daylight saving change gives one wall-clock time", () => {
    // Amsterdam turns 03:00 summer time back to 02:00 at 01:00 UTC on 25 October 2026.
    const change = [0, 1, 2].map((hour) => new Date(Date.UTC(2026, 9, 25, hour)).toISOString())

    const buckets = timeBuckets(change, "hour", "Europe/Amsterdam")

    expect(buckets.map((bucket) => bucket.label)).toEqual(["02:00", "02:00", "03:00"])
    expect(new Set(buckets.map((bucket) => bucket.key)).size).toBe(3)
  })

  it("names each day by its date, with the weekday in its title", () => {
    const days = Array.from({ length: 8 }, (_, index) =>
      new Date(Date.UTC(2026, 9, 31) + index * 24 * HOUR).toISOString().slice(0, 10),
    )

    const buckets = timeBuckets(days, "day", TZ)

    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "Oct 31",
      "Nov 1",
      "Nov 2",
      "Nov 3",
      "Nov 4",
      "Nov 5",
      "Nov 6",
      "Nov 7",
    ])
    expect(buckets[0]?.title).toBe("Sat, Oct 31")
    expect(buckets.at(-1)).toMatchObject({ title: "Sat, Nov 7, so far", partial: true })
    expect(timeBuckets(["2025-12-31", "2026-01-01"], "day", TZ).map((day) => day.title)).toEqual([
      "Wed, Dec 31, 2025",
      "Thu, Jan 1, 2026, so far",
    ])
  })
})

describe("periodPoints", () => {
  it("names the point at each period's start, and the last one now", () => {
    const hours = ["2026-11-06T09:00:00.000Z", "2026-11-06T10:00:00.000Z"]
    expect(periodPoints(hours, "hour", "Europe/Amsterdam", "2026-11-07")).toEqual({
      labels: ["10:00", "11:00", "Now"],
      titles: ["Nov 6, 10:00", "Nov 6, 11:00", "Now"],
    })
    expect(periodPoints(["2026-11-06", "2026-11-07"], "day", TZ, "2026-11-07")).toEqual({
      labels: ["Nov 6", "Nov 7", "Now"],
      titles: ["Nov 6", "Nov 7", "Now"],
    })
    expect(periodPoints(["2026-10-26", "2026-11-02"], "week", TZ, "2026-11-07")).toEqual({
      labels: ["Oct 26", "Nov 2", "Nov 7"],
      titles: ["Oct 26", "Nov 2", "Now"],
    })
  })
})
