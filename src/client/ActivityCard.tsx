import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { browserTimeZone, fetchActivity } from "./api.ts"
import { CalendarHeatmap } from "./charts/CalendarHeatmap.tsx"
import { TableToggle } from "./charts/ChartCard.tsx"
import { DataTable } from "./charts/DataTable.tsx"
import { formatCount, formatLongDay } from "./charts/scale.ts"

const STALE_TIME_MS = 5 * 60 * 1000

const Stat = ({
  label,
  value,
  detail,
}: {
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
}) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className="mt-0.5 text-xl font-semibold tracking-tight">
      {value}
      {detail !== undefined && (
        <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
          {detail}
        </span>
      )}
    </dd>
  </div>
)

const days = (count: number) => (count === 1 ? "day" : "days")

/** The signed-in user's contributions over the last year, from Forgejo's heatmap. */
export const ActivityCard = () => {
  const [tz] = useState(browserTimeZone)
  const activity = useQuery({
    queryKey: ["activity", tz],
    queryFn: () => fetchActivity(tz),
    staleTime: STALE_TIME_MS,
  })
  const data = activity.data
  const [showTable, setShowTable] = useState(false)
  const table =
    data === undefined ? null : (
      <DataTable
        caption="Contributions per day, for the days that have any"
        columns={["Day", "Contributions"]}
        rows={data.days
          .filter((day) => day.count > 0)
          .map((day) => ({ key: day.date, cells: [formatLongDay(day.date), day.count] }))}
      />
    )
  return (
    <section
      aria-labelledby="your-activity"
      className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
        <div className="lg:w-56 lg:shrink-0">
          <div className="flex items-start justify-between gap-3">
            <h2 id="your-activity" className="text-sm font-semibold tracking-tight">
              Your activity
            </h2>
            {data !== undefined && (
              <TableToggle
                pressed={showTable}
                onToggle={() => setShowTable((current) => !current)}
              />
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Contributions in Forgejo over the last year
          </p>
          {data !== undefined && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-2">
              <Stat label="Contributions" value={formatCount(data.total)} />
              <Stat
                label="Current streak"
                value={String(data.currentStreak)}
                detail={days(data.currentStreak)}
              />
              <Stat
                label="Longest streak"
                value={String(data.longestStreak)}
                detail={days(data.longestStreak)}
              />
              <Stat
                label="Busiest day"
                value={data.busiestDay === null ? "–" : formatCount(data.busiestDay.count)}
                detail={
                  data.busiestDay === null
                    ? undefined
                    : formatLongDay(data.busiestDay.date).replace(/, \d{4}$/, "")
                }
              />
            </dl>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {data !== undefined ? (
            showTable ? (
              table
            ) : (
              <>
                <CalendarHeatmap
                  days={data.days}
                  ariaLabel={`${data.total} contributions over the last year; longest streak ${data.longestStreak} days.`}
                />
                <div className="sr-only">{table}</div>
              </>
            )
          ) : activity.isError ? (
            <div role="alert" className="flex items-center gap-3 text-sm">
              <p className="text-red-700 dark:text-red-400">
                Could not load your activity: {activity.error.message}
              </p>
              <button
                type="button"
                onClick={() => void activity.refetch()}
                className="rounded-md border border-zinc-300 px-3 py-1 font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Retry
              </button>
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="h-36 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
            />
          )}
        </div>
      </div>
    </section>
  )
}
