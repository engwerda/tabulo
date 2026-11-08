import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { browserTimeZone, fetchActivity } from "./api.ts"
import { CalendarHeatmap } from "./charts/CalendarHeatmap.tsx"
import { TableToggle } from "./charts/ChartCard.tsx"
import { DataTable, HiddenTable } from "./charts/DataTable.tsx"
import { formatCount, formatLongDay } from "./charts/scale.ts"
import { ErrorNotice } from "./ui/ErrorNotice.tsx"
import { cardClass } from "./ui/primitives.tsx"

const STALE_TIME_MS = 5 * 60 * 1000

/** The prefix of the activity query's key, for refetching it from outside the card. */
export const ACTIVITY = ["activity"] as const

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
    <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className="mt-0.5 truncate text-xl leading-7 font-semibold tracking-tight tabular-nums">
      {value}
      {detail !== undefined && (
        <span className="ml-1.5 text-xs font-normal tracking-normal text-zinc-500 dark:text-zinc-400">
          {detail}
        </span>
      )}
    </dd>
  </div>
)

const days = (count: number) => (count === 1 ? "day" : "days")

const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })

const headingId = "your-activity"

const Heading = ({ children }: { children?: ReactNode }) => (
  <div className="flex min-h-8 items-center gap-3">
    <h2 id={headingId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      Your activity
    </h2>
    <p className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">
      Contributions in Forgejo over the last year
    </p>
    {children}
  </div>
)

/** The signed-in user's contributions over the last year, from Forgejo's heatmap. */
export const ActivityCard = () => {
  const [tz] = useState(browserTimeZone)
  const activity = useQuery({
    queryKey: [...ACTIVITY, tz],
    queryFn: () => fetchActivity(tz),
    staleTime: STALE_TIME_MS,
  })
  const data = activity.data
  const [showTable, setShowTable] = useState(false)

  if (data === undefined) {
    return (
      <section aria-labelledby={headingId} className={`${cardClass} px-4 py-3`}>
        <Heading />
        {activity.isError ? (
          <ErrorNotice
            bare
            className="mt-3"
            title="Could not load your activity"
            onRetry={() => void activity.refetch()}
            retrying={activity.isFetching}
          >
            {activity.error.message}
          </ErrorNotice>
        ) : (
          <div role="status" className="mt-3 mb-1 flex gap-8">
            <span className="sr-only">Loading your activity…</span>
            <div className="hidden w-56 shrink-0 grid-cols-2 gap-4 lg:grid">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="h-12 animate-shimmer rounded-lg bg-zinc-100 dark:bg-zinc-800/70"
                />
              ))}
            </div>
            <div className="h-32 flex-1 animate-shimmer rounded-lg bg-zinc-100 dark:bg-zinc-800/70" />
          </div>
        )}
      </section>
    )
  }

  if (data.total === 0) {
    return (
      <section
        aria-labelledby={headingId}
        className={`${cardClass} flex min-h-11 flex-wrap items-center gap-x-3 px-4 py-1.5`}
      >
        <h2 id={headingId} className="text-sm leading-6 font-semibold">
          Your activity
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No contributions in Forgejo over the last year.
        </p>
      </section>
    )
  }

  const table = (
    <DataTable
      caption="Contributions per day, for the days that have any"
      columns={["Day", "Contributions"]}
      rows={data.days
        .filter((day) => day.count > 0)
        .map((day) => ({ key: day.date, cells: [formatLongDay(day.date), day.count] }))}
    />
  )
  return (
    <section aria-labelledby={headingId} className={`${cardClass} p-4`}>
      <Heading>
        <span className="ml-auto">
          <TableToggle pressed={showTable} onToggle={() => setShowTable((current) => !current)} />
        </span>
      </Heading>
      <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:gap-8">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:w-56 lg:shrink-0 lg:grid-cols-2 lg:content-start">
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
            detail={data.busiestDay === null ? undefined : shortDay(data.busiestDay.date)}
          />
        </dl>
        <div className="min-w-0 flex-1">
          {showTable ? (
            table
          ) : (
            <>
              <CalendarHeatmap
                days={data.days}
                ariaLabel={`${data.total} contributions over the last year; longest streak ${data.longestStreak} days.`}
              />
              <HiddenTable>{table}</HiddenTable>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
