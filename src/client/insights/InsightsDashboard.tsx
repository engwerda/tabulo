import { type ReactNode, useState } from "react"
import type { Insights, Language } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { AreaChart } from "../charts/AreaChart.tsx"
import { BarList } from "../charts/BarList.tsx"
import { ChartCard } from "../charts/ChartCard.tsx"
import { GroupedColumns, StackedColumns } from "../charts/columns.tsx"
import { DataTable } from "../charts/DataTable.tsx"
import { Legend } from "../charts/Legend.tsx"
import { Meter } from "../charts/Meter.tsx"
import { Punchcard } from "../charts/Punchcard.tsx"
import { SegmentedBar } from "../charts/SegmentedBar.tsx"
import { ShowAll } from "../charts/ShowAll.tsx"
import { StatFigure, StatTile } from "../charts/StatTile.tsx"
import { formatCount, formatHours, formatMinutes, formatPercent } from "../charts/scale.ts"
import { useWidth } from "../charts/use-width.ts"
import { cardClass, Segmented } from "../ui/primitives.tsx"
import { AllClear, AttentionList, type BoardHref } from "./AttentionList.tsx"
import { type Cell, packRows, type Row } from "./layout.ts"
import { RepoHealthTable } from "./RepoHealthTable.tsx"
import { formatWindowStart, priorLabel } from "./summary.ts"
import { axisDay, bucketTotals, formatDate, type Grain, spansYears, timeBuckets } from "./weeks.ts"

const SERIES = {
  opened: "var(--chart-1)",
  closed: "var(--chart-2)",
  success: "var(--chart-positive)",
  failure: "var(--chart-negative)",
  other: "var(--chart-neutral)",
} as const

const LANGUAGE_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
const OTHER_LANGUAGE = "var(--chart-axis)"

const DAY_NAMES = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
]

const sum = (values: ReadonlyArray<number>) => values.reduce((total, value) => total + value, 0)

// The card's padding and the column chart's axis margin, which the plot does not get.
const CARD_CHROME = 74

/**
 * Columns for a weekly chart in the card `ref` measures: one per week, or one per month when
 * the card is too narrow for weekly columns of at least `minBand` pixels, as a year is on a phone.
 */
const useTimeBuckets = (weeks: ReadonlyArray<{ readonly weekStart: string }>, minBand: number) => {
  const [ref, width] = useWidth<HTMLElement>()
  const grain: Grain =
    width > 0 && (width - CARD_CHROME) / Math.max(weeks.length, 1) < minBand ? "month" : "week"
  const buckets = timeBuckets(
    weeks.map((week) => week.weekStart),
    grain,
  )
  return { ref, grain, buckets }
}

/** The legend under a weekly chart, with the grain of its columns at the right. */
const TimeLegend = ({
  grain,
  items,
}: {
  readonly grain: Grain
  readonly items: Parameters<typeof Legend>[0]["items"]
}) => (
  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
    <Legend items={items} />
    <span className="ml-auto text-2xs text-zinc-500 dark:text-zinc-400">
      {grain === "week" ? "Per week" : "Weeks grouped by month"}
    </span>
  </div>
)

const Headline = ({ insights }: { readonly insights: Insights }) => {
  const { tiles, weekly } = insights
  const since = `since ${formatWindowStart(insights.window)}`
  const prior = priorLabel(insights.window)
  const secondary = [
    <StatFigure
      key="opened"
      label="Issues opened"
      value={tiles.issuesOpened.value}
      previous={tiles.issuesOpened.previous}
      goodWhen="neutral"
      comparison={prior}
    />,
    tiles.medianIssueCloseHours.value !== null && (
      <StatFigure
        key="close"
        label="Median time to close"
        value={tiles.medianIssueCloseHours.value}
        previous={tiles.medianIssueCloseHours.previous}
        format={formatHours}
        goodWhen="down"
        comparison={prior}
      />
    ),
    tiles.medianPullMergeHours.value !== null && (
      <StatFigure
        key="merge"
        label="Median time to merge"
        value={tiles.medianPullMergeHours.value}
        previous={tiles.medianPullMergeHours.previous}
        format={formatHours}
        goodWhen="down"
        comparison={prior}
      />
    ),
    tiles.ciSuccessRate.value !== null && (
      <StatFigure
        key="ci"
        label="CI pass rate"
        value={tiles.ciSuccessRate.value}
        previous={tiles.ciSuccessRate.previous}
        format={formatPercent}
        goodWhen="up"
        deltaMode="points"
        comparison={prior}
      />
    ),
  ].filter((figure) => figure !== false)
  return (
    <section aria-label="Headline numbers" className={`${cardClass} overflow-hidden`}>
      <dl className="grid grid-cols-2 gap-px bg-zinc-200/80 lg:grid-cols-4 dark:bg-zinc-800">
        <StatTile
          label="Open issues"
          value={tiles.openIssues.value}
          previous={tiles.openIssues.previous}
          goodWhen="down"
          deltaMode="absolute"
          comparison={since}
          trend={weekly.map((week) => week.openIssues)}
        />
        <StatTile
          label="Open pull requests"
          value={tiles.openPulls.value}
          previous={tiles.openPulls.previous}
          goodWhen="down"
          deltaMode="absolute"
          comparison={since}
        />
        <StatTile
          label="Issues closed"
          value={tiles.issuesClosed.value}
          previous={tiles.issuesClosed.previous}
          goodWhen="up"
          comparison={prior}
          trend={weekly.map((week) => week.issuesClosed)}
        />
        <StatTile
          label="Pull requests merged"
          value={tiles.pullsMerged.value}
          previous={tiles.pullsMerged.previous}
          goodWhen="up"
          comparison={prior}
          trend={weekly.map((week) => week.pullsMerged)}
        />
      </dl>
      <div className="flex flex-col gap-3 border-t border-zinc-200/80 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5 dark:border-zinc-800">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-10">
          {secondary}
        </dl>
        <p className="text-2xs text-zinc-500 dark:text-zinc-400">Changes {prior}</p>
      </div>
    </section>
  )
}

const Throughput = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => {
  const [kind, setKind] = useState<"issues" | "pulls">("issues")
  const { ref, grain, buckets } = useTimeBuckets(insights.weekly, 8)
  const opened = {
    label: "opened",
    color: SERIES.opened,
    values: bucketTotals(
      buckets,
      insights.weekly.map((week) => (kind === "issues" ? week.issuesOpened : week.pullsOpened)),
    ),
  }
  const done = {
    label: kind === "issues" ? "closed" : "merged",
    color: SERIES.closed,
    values: bucketTotals(
      buckets,
      insights.weekly.map((week) => (kind === "issues" ? week.issuesClosed : week.pullsMerged)),
    ),
  }
  const noun = kind === "issues" ? "issues" : "pull requests"
  const [openedTotal, doneTotal] = [sum(opened.values), sum(done.values)]
  return (
    <ChartCard
      ref={ref}
      title="Throughput"
      description={`${formatCount(openedTotal)} ${noun} opened, ${formatCount(doneTotal)} ${done.label}`}
      className={className}
      actions={
        <Segmented
          label="Show"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: "issues", label: "Issues" },
            {
              value: "pulls",
              label: (
                <>
                  <span className="max-sm:hidden">Pull requests</span>
                  <span className="sm:hidden">PRs</span>
                </>
              ),
            },
          ]}
        />
      }
      table={
        <DataTable
          caption={`${noun} opened and ${done.label} per ${grain}, newest first`}
          columns={[
            grain === "week" ? "Week" : "Month",
            "Opened",
            kind === "issues" ? "Closed" : "Merged",
          ]}
          rows={buckets
            .map((bucket, index) => ({
              key: bucket.key,
              cells: [bucket.title, opened.values[index], done.values[index]],
            }))
            .reverse()}
        />
      }
    >
      <GroupedColumns
        categories={buckets}
        series={[opened, done]}
        height={220}
        ariaLabel={`${noun} per ${grain}: ${openedTotal} opened and ${doneTotal} ${done.label} over ${insights.weekly.length} weeks.`}
        tooltipTitle={(index) => buckets[index]?.title ?? ""}
      />
      <TimeLegend
        grain={grain}
        items={[
          { label: "Opened", color: opened.color },
          { label: kind === "issues" ? "Closed" : "Merged", color: done.color },
        ]}
      />
    </ChartCard>
  )
}

const Attention = ({
  insights,
  boardHref,
  className,
}: {
  readonly insights: Insights
  readonly boardHref: BoardHref
  readonly className: string
}) => (
  <ChartCard
    title="Needs attention"
    description={`${insights.attention.length} ${insights.attention.length === 1 ? "item" : "items"}: failing CI, overdue milestones, idle work`}
    className={className}
  >
    <AttentionList items={insights.attention} boardHref={boardHref} />
  </ChartCard>
)

const Backlog = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => {
  // The same baseline as the headline tile: the count when the window opened, then the count
  // each Monday as the week before it closed, then now.
  const { end } = insights.window
  const { value: now, previous: atStart } = insights.tiles.openIssues
  const dates = [...insights.weekly.map((week) => week.weekStart), end]
  const values = [atStart, ...insights.weekly.map((week) => week.openIssues)]
  values[values.length - 1] = now
  const withYear = spansYears(dates)
  const pointTitle = (index: number) =>
    index === dates.length - 1 ? "Now" : formatDate(dates[index] ?? "", withYear)
  const change = now - atStart
  return (
    <ChartCard
      title="Open issues"
      description={`${formatCount(now)} open now, ${
        change === 0
          ? "no change"
          : `${change > 0 ? "up" : "down"} ${formatCount(Math.abs(change))}`
      } since ${formatWindowStart(insights.window)}`}
      className={className}
      table={
        <DataTable
          caption="Open issues now and at the start of each week, newest first"
          columns={["Date", "Open issues"]}
          rows={values
            .map((count, index) => ({
              key: `${index}`,
              cells: [pointTitle(index), count],
            }))
            .reverse()}
        />
      }
    >
      <AreaChart
        labels={dates.map((date) => axisDay(date, dates))}
        values={values}
        seriesLabel="open issues"
        partialLast
        ariaLabel={`Open issues went from ${atStart} on ${formatWindowStart(insights.window)} to ${now} now.`}
        tooltipTitle={pointTitle}
      />
    </ChartCard>
  )
}

const MergeTime = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => {
  const { pullMergeTime } = insights
  const merged = sum(pullMergeTime.buckets.map((bucket) => bucket.count))
  return (
    <ChartCard
      title="Time to merge"
      description={`${formatCount(merged)} pull ${merged === 1 ? "request" : "requests"} merged, from opening to merge`}
      className={className}
      table={
        <DataTable
          caption="Pull requests by time to merge"
          columns={["Time to merge", "Pull requests"]}
          rows={pullMergeTime.buckets.map((bucket) => ({
            key: bucket.label,
            cells: [bucket.label, bucket.count],
          }))}
        />
      }
    >
      <dl className="mb-4 flex gap-6">
        {(
          [
            ["Median", pullMergeTime.p50],
            ["75th percentile", pullMergeTime.p75],
            ["90th percentile", pullMergeTime.p90],
          ] as const
        ).map(([label, value]) =>
          value === null ? null : (
            <div key={label}>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {formatHours(value)}
              </dd>
            </div>
          ),
        )}
      </dl>
      <StackedColumns
        categories={pullMergeTime.buckets.map((bucket) => ({
          key: bucket.label,
          label: bucket.label,
        }))}
        series={[
          {
            label: "pull requests",
            color: SERIES.opened,
            values: pullMergeTime.buckets.map((bucket) => bucket.count),
          },
        ]}
        height={150}
        capLabels
        ariaLabel={`Merge time distribution: ${pullMergeTime.buckets.map((bucket) => `${bucket.label} ${bucket.count}`).join(", ")}.`}
        tooltipTitle={(index) => `Merged in ${pullMergeTime.buckets[index]?.label ?? ""}`}
      />
    </ChartCard>
  )
}

const CiHealth = ({
  ci,
  period,
  className,
}: {
  readonly ci: NonNullable<Insights["ci"]>
  readonly period: Insights["window"]
  readonly className: string
}) => {
  const { ref, grain, buckets } = useTimeBuckets(ci.weekly, 6)
  const outcomes = [
    { label: "passed", color: SERIES.success, values: ci.weekly.map((week) => week.success) },
    { label: "failed", color: SERIES.failure, values: ci.weekly.map((week) => week.failure) },
    { label: "other", color: SERIES.other, values: ci.weekly.map((week) => week.other) },
  ].map((series) => ({ ...series, values: bucketTotals(buckets, series.values) }))
  return (
    <ChartCard
      ref={ref}
      title="CI health"
      description={`${formatCount(ci.runs)} workflow runs since ${formatWindowStart(period)}`}
      className={className}
      table={
        <DataTable
          caption={`Workflow runs per ${grain} by outcome, newest first`}
          columns={[grain === "week" ? "Week" : "Month", "Passed", "Failed", "Other"]}
          rows={buckets
            .map((bucket, index) => ({
              key: bucket.key,
              cells: [bucket.title, ...outcomes.map((series) => series.values[index])],
            }))
            .reverse()}
        />
      }
    >
      <dl className="mb-4 flex gap-6">
        {ci.successRate !== null && (
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Pass rate</dt>
            <dd className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatPercent(ci.successRate)}
            </dd>
          </div>
        )}
        {ci.medianDurationMinutes !== null && (
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Median run</dt>
            <dd className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatMinutes(ci.medianDurationMinutes)}
            </dd>
          </div>
        )}
      </dl>
      <StackedColumns
        categories={buckets}
        series={outcomes}
        height={160}
        ariaLabel={`CI runs per ${grain}: ${sum(ci.weekly.map((week) => week.success))} passed, ${sum(ci.weekly.map((week) => week.failure))} failed.`}
        tooltipTitle={(index) => buckets[index]?.title ?? ""}
      />
      <TimeLegend
        grain={grain}
        items={[
          { label: "Passed", color: SERIES.success },
          { label: "Failed", color: SERIES.failure },
          { label: "Cancelled or skipped", color: SERIES.other },
        ]}
      />
      {ci.slowestWorkflows.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <h3 className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Slowest workflows, median run
          </h3>
          <ul className="flex flex-col gap-1.5 text-xs">
            {ci.slowestWorkflows.map((workflow) => (
              <li
                key={`${workflow.repo}/${workflow.name}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {workflow.name}
                  </span>{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">{workflow.repo}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    {formatMinutes(workflow.medianDurationMinutes)}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" · "}
                    {formatCount(workflow.runs)} runs
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}

const busiestSlot = (punchcard: Insights["punchcard"]) =>
  punchcard.reduce<{ day: number; hour: number; count: number }>(
    (best, hours, day) =>
      hours.reduce(
        (inner, count, hour) => (count > inner.count ? { day, hour, count } : inner),
        best,
      ),
    { day: 0, hour: 0, count: 0 },
  )

const Activity = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => {
  const total = sum(insights.punchcard.flat())
  const busiest = busiestSlot(insights.punchcard)
  return (
    <ChartCard
      title="When work happens"
      description={`Busiest on ${DAY_NAMES[busiest.day]} around ${String(busiest.hour).padStart(2, "0")}:00, ${insights.tz}`}
      className={className}
      table={
        <DataTable
          caption="Events per weekday and hour"
          columns={["Weekday", ...Array.from({ length: 24 }, (_, hour) => String(hour))]}
          rows={insights.punchcard.map((hours, day) => ({
            key: String(day),
            cells: [DAY_NAMES[day] ?? "", ...hours],
          }))}
        />
      }
    >
      <Punchcard
        grid={insights.punchcard}
        unit="events"
        ariaLabel={`${total} issue and pull request events by weekday and hour.`}
      />
    </ChartCard>
  )
}

const IssueAge = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => (
  <ChartCard
    title="Age of open issues"
    description="Time since each open issue was opened"
    className={className}
    table={
      <DataTable
        caption="Open issues by age"
        columns={["Age", "Open issues"]}
        rows={insights.issueAge.map((bucket) => ({
          key: bucket.label,
          cells: [bucket.label, bucket.count],
        }))}
      />
    }
  >
    <StackedColumns
      categories={insights.issueAge.map((bucket) => ({ key: bucket.label, label: bucket.label }))}
      series={[
        {
          label: "open issues",
          color: SERIES.opened,
          values: insights.issueAge.map((bucket) => bucket.count),
        },
      ]}
      capLabels
      height={170}
      ariaLabel={`Open issues by age: ${insights.issueAge.map((bucket) => `${bucket.label} ${bucket.count}`).join(", ")}.`}
      tooltipTitle={(index) => `Open for ${insights.issueAge[index]?.label ?? ""}`}
    />
  </ChartCard>
)

const LIST_LIMIT = 7

/** A label's name with its scope in a lighter tone, as `LabelChip` shows it. */
const LabelName = ({ name }: { readonly name: string }) => {
  const slash = name.lastIndexOf("/")
  return slash > 0 ? (
    <>
      <span className="text-zinc-600 dark:text-zinc-400">{name.slice(0, slash + 1)}</span>
      {name.slice(slash + 1)}
    </>
  ) : (
    name
  )
}

const Labels = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => (
  <ChartCard title="Top labels" description="Labels on open issues" className={className}>
    <BarList
      ariaLabel="Labels on open issues"
      limit={LIST_LIMIT}
      rows={insights.labels.map((label) => ({
        key: label.name,
        name: <LabelName name={label.name} />,
        lead: (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: label.color }}
          />
        ),
        segments: [{ label: "open issues", value: label.count, color: SERIES.opened }],
        display: formatCount(label.count),
      }))}
    />
  </ChartCard>
)

const Contributors = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => (
  <ChartCard
    title="Contributors"
    description="Pull requests merged by author, issues closed by assignee"
    className={className}
  >
    <BarList
      ariaLabel="Contributors"
      limit={LIST_LIMIT}
      rows={insights.contributors.map((person) => ({
        key: person.login,
        name: person.login,
        lead: <Avatar url={person.avatarUrl} name={person.login} size="xs" />,
        segments: [
          { label: "pull requests merged", value: person.pullsMerged, color: SERIES.opened },
          { label: "issues closed", value: person.issuesClosed, color: SERIES.closed },
        ],
        display: (
          <>
            <span className="text-zinc-900 dark:text-zinc-100">{person.pullsMerged}</span>
            <span className="text-zinc-500 dark:text-zinc-400"> merged · </span>
            <span className="text-zinc-900 dark:text-zinc-100">{person.issuesClosed}</span>
            <span className="text-zinc-500 dark:text-zinc-400"> closed</span>
          </>
        ),
      }))}
    />
    <div className="mt-4">
      <Legend
        items={[
          { label: "Pull requests merged", color: SERIES.opened },
          { label: "Issues closed", color: SERIES.closed },
        ]}
      />
    </div>
  </ChartCard>
)

const MILESTONE_LIMIT = 5

const dueFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
const dueWithYearFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})

const Milestones = ({
  insights,
  className,
}: {
  readonly insights: Insights
  readonly className: string
}) => {
  const now = Date.parse(insights.generatedAt)
  const thisYear = new Date(now).getFullYear()
  const formatDue = (dueOn: string) => {
    const due = new Date(dueOn)
    return (due.getFullYear() === thisYear ? dueFormat : dueWithYearFormat).format(due)
  }
  const [expanded, setExpanded] = useState(false)
  const { milestones } = insights
  return (
    <ChartCard
      title="Milestones"
      description={`${milestones.length} open, nearest due date first`}
      className={className}
    >
      <ul className="flex flex-col gap-3.5">
        {(expanded ? milestones : milestones.slice(0, MILESTONE_LIMIT)).map((milestone) => {
          const total = milestone.openIssues + milestone.closedIssues
          const overdue =
            milestone.dueOn !== null &&
            Date.parse(milestone.dueOn) < now &&
            milestone.openIssues > 0
          return (
            // The name's link stretches over the row, so the whole row is one target.
            <li key={milestone.url} className="relative">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <a
                  href={milestone.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate before:absolute before:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  <span className="text-zinc-800 dark:text-zinc-200">{milestone.title}</span>{" "}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{milestone.repo}</span>
                  <span className="sr-only"> (opens in Forgejo)</span>
                </a>
                {total > 0 && (
                  <span className="shrink-0 text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300">
                    {Math.round((milestone.closedIssues / total) * 100)}%
                  </span>
                )}
              </div>
              <Meter
                value={milestone.closedIssues}
                max={total}
                tone={overdue ? "danger" : "done"}
                ariaLabel={
                  total === 0
                    ? `${milestone.title}: no issues yet`
                    : `${milestone.title}: ${milestone.closedIssues} of ${total} issues closed`
                }
              />
              <p className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {total === 0 ? "No issues yet" : `${milestone.closedIssues} of ${total} closed`}
                {milestone.dueOn !== null && (
                  <>
                    {" · "}
                    <span className={overdue ? "font-medium text-red-700 dark:text-red-400" : ""}>
                      {overdue ? "overdue since" : "due"} {formatDue(milestone.dueOn)}
                    </span>
                  </>
                )}
              </p>
            </li>
          )
        })}
      </ul>
      {milestones.length > MILESTONE_LIMIT && (
        <ShowAll
          total={milestones.length}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
        />
      )}
    </ChartCard>
  )
}

const Repositories = ({ insights }: { readonly insights: Insights }) => {
  const slots = new Map(
    insights.languages
      .filter((language) => language.name !== "Other")
      .map((language, index) => [language.name, LANGUAGE_SLOTS[index] ?? OTHER_LANGUAGE] as const),
  )
  const languageColor = (language: Language) => slots.get(language.name) ?? OTHER_LANGUAGE
  const totalBytes = sum(insights.languages.map((language) => language.bytes))
  return (
    <ChartCard
      title="Repositories"
      description="Riskiest first. Expand a row to see what took points off its health score."
    >
      {insights.languages.length > 0 && (
        <div className="mb-5">
          <SegmentedBar
            ariaLabel="Languages across the repositories"
            segments={insights.languages.map((language) => ({
              label: language.name,
              value: language.bytes,
              color: languageColor(language),
            }))}
          />
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
            {insights.languages.map((language) => (
              <li key={language.name} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-[3px]"
                  style={{ background: languageColor(language) }}
                />
                {language.name}
                <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
                  {Math.round((language.bytes / Math.max(totalBytes, 1)) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <RepoHealthTable repos={insights.repoStats} languageColor={languageColor} />
    </ChartCard>
  )
}

type Card = {
  readonly key: string
  /** The card's name and why it is left out, when it has nothing to show in this period. */
  readonly empty: string | null
  readonly render: (className: string) => ReactNode
}

const ROW_CLASS = {
  wide: "grid gap-4 lg:grid-cols-3",
  three: "grid gap-4 md:grid-cols-2 lg:grid-cols-3",
  two: "grid gap-4 md:grid-cols-2",
  one: "grid gap-4",
} as const

/** Rows of cards whose spans add up to the row's columns, so the grid never shows a hole. */
const CardRows = ({ rows }: { readonly rows: ReadonlyArray<Row<Card>> }) =>
  rows.map((row) => {
    const shape =
      row.kind === "wide"
        ? row.cells.length === 2
          ? "wide"
          : "one"
        : row.cells.length === 3
          ? "three"
          : row.cells.length === 2
            ? "two"
            : "one"
    return (
      <div key={row.cells.map((cell) => cell.item.key).join("+")} className={ROW_CLASS[shape]}>
        {row.cells.map((cell, index) =>
          cell.item.render(
            shape === "wide" && cell.span === 2
              ? "lg:col-span-2"
              : shape === "three" && index === 2
                ? "md:col-span-2 lg:col-span-1"
                : "",
          ),
        )}
      </div>
    )
  })

/** Every card of the insights page, for one loaded payload. */
export const InsightsDashboard = ({
  insights,
  boardHref,
}: {
  readonly insights: Insights
  readonly boardHref: BoardHref
}) => {
  const merged = sum(insights.pullMergeTime.buckets.map((bucket) => bucket.count))
  const cards: ReadonlyArray<Cell<Card>> = [
    {
      span: 2,
      item: {
        key: "throughput",
        empty: null,
        render: (className) => (
          <Throughput key="throughput" insights={insights} className={className} />
        ),
      },
    },
    // An empty attention list is the "All clear" line above the grid instead.
    ...(insights.attention.length === 0
      ? []
      : [
          {
            span: 1 as const,
            item: {
              key: "attention",
              empty: null,
              render: (className: string) => (
                <Attention
                  key="attention"
                  insights={insights}
                  boardHref={boardHref}
                  className={className}
                />
              ),
            },
          },
        ]),
    {
      span: 1,
      item: {
        key: "backlog",
        empty: null,
        render: (className) => <Backlog key="backlog" insights={insights} className={className} />,
      },
    },
    {
      span: 1,
      item: {
        key: "merge",
        empty: merged === 0 ? "Time to merge (nothing merged)" : null,
        render: (className) => <MergeTime key="merge" insights={insights} className={className} />,
      },
    },
    ...(insights.ci === null
      ? []
      : [
          {
            span: 1 as const,
            item: {
              key: "ci",
              empty: insights.ci.runs === 0 ? "CI health (no runs)" : null,
              render: (className: string) =>
                insights.ci === null ? null : (
                  <CiHealth
                    key="ci"
                    ci={insights.ci}
                    period={insights.window}
                    className={className}
                  />
                ),
            },
          },
        ]),
    {
      span: 2,
      item: {
        key: "activity",
        empty: sum(insights.punchcard.flat()) === 0 ? "When work happens (no activity)" : null,
        render: (className) => (
          <Activity key="activity" insights={insights} className={className} />
        ),
      },
    },
    {
      span: 1,
      item: {
        key: "age",
        empty:
          sum(insights.issueAge.map((bucket) => bucket.count)) === 0
            ? "Age of open issues (none open)"
            : null,
        render: (className) => <IssueAge key="age" insights={insights} className={className} />,
      },
    },
    {
      span: 1,
      item: {
        key: "labels",
        empty: insights.labels.length === 0 ? "Top labels (no labeled open issues)" : null,
        render: (className) => <Labels key="labels" insights={insights} className={className} />,
      },
    },
    {
      span: 1,
      item: {
        key: "contributors",
        empty:
          insights.contributors.length === 0 ? "Contributors (nothing merged or closed)" : null,
        render: (className) => (
          <Contributors key="contributors" insights={insights} className={className} />
        ),
      },
    },
    {
      span: 1,
      item: {
        key: "milestones",
        empty: insights.milestones.length === 0 ? "Milestones (none open)" : null,
        render: (className) => (
          <Milestones key="milestones" insights={insights} className={className} />
        ),
      },
    },
  ]
  const shown = cards.filter((cell) => cell.item.empty === null)
  const notes = cards.flatMap((cell) => (cell.item.empty === null ? [] : [cell.item.empty]))
  return (
    <div className="flex flex-col gap-4">
      <Headline insights={insights} />
      {insights.attention.length === 0 && <AllClear />}
      <CardRows rows={packRows(shown)} />
      {notes.length > 0 && (
        <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
          Nothing to show in this period for{" "}
          {notes.length === 1 ? notes[0] : `${notes.slice(0, -1).join(", ")} or ${notes.at(-1)}`}.
        </p>
      )}
      <Repositories insights={insights} />
    </div>
  )
}
