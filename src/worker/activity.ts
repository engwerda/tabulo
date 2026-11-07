import type { Activity, ActivityDay } from "../shared/api.ts"
import type { ForgejoHeatmapEntry } from "./forgejo/schemas.ts"
import { addDays, zonedTime } from "./time-zone.ts"

const CALENDAR_DAYS = 365

/** Days in a row with contributions that end at `last`, counting back. */
const streakEndingAt = (days: ReadonlyArray<ActivityDay>, last: number) => {
  let length = 0
  for (let index = last; index >= 0 && (days[index]?.count ?? 0) > 0; index--) length++
  return length
}

/**
 * The user's contributions per day over the last year, in `tz`. A streak that has no
 * contribution yet today still counts while today lasts.
 */
export const buildActivity = (
  entries: ReadonlyArray<ForgejoHeatmapEntry>,
  tz: string,
  now: number,
): Activity => {
  const zoned = zonedTime(tz)
  const today = zoned(now).date
  const first = addDays(today, -(CALENDAR_DAYS - 1))
  const perDate = new Map<string, number>()
  for (const { timestamp, contributions } of entries) {
    const { date } = zoned(timestamp * 1000)
    if (date >= first && date <= today) perDate.set(date, (perDate.get(date) ?? 0) + contributions)
  }
  const days = Array.from({ length: CALENDAR_DAYS }, (_, index): ActivityDay => {
    const date = addDays(first, index)
    return { date, count: perDate.get(date) ?? 0 }
  })
  const last = days.length - 1
  let longestStreak = 0
  let run = 0
  let busiestDay: ActivityDay | null = null
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0
    longestStreak = Math.max(longestStreak, run)
    if (day.count > 0 && (busiestDay === null || day.count > busiestDay.count)) busiestDay = day
  }
  return {
    days,
    total: days.reduce((total, day) => total + day.count, 0),
    currentStreak: streakEndingAt(days, (days[last]?.count ?? 0) > 0 ? last : last - 1),
    longestStreak,
    busiestDay,
  }
}
