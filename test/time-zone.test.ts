import { describe, expect, it } from "vitest"
import { zonedTime } from "../src/worker/time-zone.ts"

describe("zonedTime", () => {
  it("follows a daylight saving change within the day", () => {
    // Europe/Amsterdam leaves summer time at 01:00 UTC on Sunday 25 October 2026.
    const amsterdam = zonedTime("Europe/Amsterdam")
    expect(amsterdam(Date.UTC(2026, 9, 25, 0, 30))).toEqual({
      date: "2026-10-25",
      weekday: 6,
      hour: 2,
    })
    expect(amsterdam(Date.UTC(2026, 9, 25, 1, 30))).toEqual({
      date: "2026-10-25",
      weekday: 6,
      hour: 2,
    })
    expect(amsterdam(Date.UTC(2026, 9, 25, 22, 30))).toEqual({
      date: "2026-10-25",
      weekday: 6,
      hour: 23,
    })
    expect(amsterdam(Date.UTC(2026, 9, 25, 23, 30))).toEqual({
      date: "2026-10-26",
      weekday: 0,
      hour: 0,
    })
  })

  it("handles offsets that are not whole hours", () => {
    // Kathmandu is UTC+05:45.
    expect(zonedTime("Asia/Kathmandu")(Date.UTC(2026, 10, 7, 18, 15))).toEqual({
      date: "2026-11-08",
      weekday: 6,
      hour: 0,
    })
  })
})
