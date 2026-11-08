import { describe, expect, it } from "vitest"
import { bucketTotals, timeBuckets } from "../src/client/insights/weeks.ts"

const WEEK = 7 * 24 * 60 * 60 * 1000
const year: ReadonlyArray<string> = Array.from({ length: 53 }, (_, index) =>
  new Date(Date.parse("2025-11-03") + index * WEEK).toISOString().slice(0, 10),
)

describe("timeBuckets", () => {
  it("names each week, with the year when the range crosses one, and marks the last in progress", () => {
    const weeks = timeBuckets(year, "week")
    expect(weeks).toHaveLength(53)
    expect(weeks[0]?.title).toBe("Week of Nov 3, 2025")
    expect(weeks.at(-1)?.title).toBe("Week of Nov 2, 2026, so far")
    expect(timeBuckets(year.slice(-13), "week")[0]?.title).toBe("Week of Aug 10")
  })

  it("marks the year on week labels in the earlier year or in January, when the range spans two", () => {
    const labels = timeBuckets(year, "week").map((week) => week.label)
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
    expect(timeBuckets(year.slice(-13), "week")[0]?.label).toBe("Aug 10")
    expect(timeBuckets(year.slice(10, 20), "week")[0]?.label).toBe("Jan 12")
  })

  it("groups a year of weeks into months, marking the year at the start and at January", () => {
    const months = timeBuckets(year, "month")
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
    expect(timeBuckets(year.slice(3), "month")[0]?.title).toBe(
      "Weeks starting in Nov 2025, from Nov 24",
    )
  })

  it("puts every week in exactly one month and keeps the totals", () => {
    const months = timeBuckets(year, "month")
    expect(months.flatMap((month) => month.weeks)).toHaveLength(53)
    expect(
      bucketTotals(
        months,
        year.map(() => 1),
      ).reduce((sum, count) => sum + count),
    ).toBe(53)
  })
})
