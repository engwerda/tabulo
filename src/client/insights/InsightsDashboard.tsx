import { useState } from "react"
import type { Insights, Language } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { AreaChart } from "../charts/AreaChart.tsx"
import { BarList } from "../charts/BarList.tsx"
import { ChartCard } from "../charts/ChartCard.tsx"
import { MirrorColumns, StackedColumns } from "../charts/columns.tsx"
import { DataTable } from "../charts/DataTable.tsx"
import { Legend } from "../charts/Legend.tsx"
import { Meter } from "../charts/Meter.tsx"
import { Punchcard } from "../charts/Punchcard.tsx"
import { SegmentedBar } from "../charts/SegmentedBar.tsx"
import { StatTile } from "../charts/StatTile.tsx"
import {
  formatCount,
  formatDay,
  formatHours,
  formatMinutes,
  formatPercent,
} from "../charts/scale.ts"
import { AttentionList } from "./AttentionList.tsx"
import { RepoHealthTable } from "./RepoHealthTable.tsx"
import { RANGE_LABELS } from "./summary.ts"

const SERIES = {
  opened: "var(--chart-1)",
  closed: "var(--chart-2)",
  success: "var(--chart-positive)",
  failure: "var(--chart-negative)",
  other: "var(--chart-axis)",
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

/** The last week of `weeks` is the current one, still in progress. */
const weekTitle = (weeks: ReadonlyArray<{ readonly weekStart: string }>, index: number) =>
  `Week of ${formatDay(weeks[index]?.weekStart ?? "")}${index === weeks.length - 1 ? ", so far" : ""}`

const weekCategories = (weeks: ReadonlyArray<{ readonly weekStart: string }>) =>
  weeks.map((week, index) => ({
    key: week.weekStart,
    label: formatDay(week.weekStart),
    partial: index === weeks.length - 1,
  }))

const sum = (values: ReadonlyArray<number>) => values.reduce((total, value) => total + value, 0)

const Segmented = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>
  readonly value: T
  readonly onChange: (value: T) => void
}) => (
  <fieldset className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
    <legend className="sr-only">{label}</legend>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 aria-pressed:bg-white aria-pressed:text-zinc-900 aria-pressed:shadow-xs dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-950 dark:aria-pressed:text-zinc-50"
      >
        {option.label}
      </button>
    ))}
  </fieldset>
)

const Empty = ({ children }: { readonly children: string }) => (
  <p className="grid flex-1 place-items-center py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
    {children}
  </p>
)

const Throughput = ({ insights }: { readonly insights: Insights }) => {
  const [kind, setKind] = useState<"issues" | "pulls">("issues")
  const categories = weekCategories(insights.weekly)
  const up = {
    label: "Opened",
    color: SERIES.opened,
    values: insights.weekly.map((week) =>
      kind === "issues" ? week.issuesOpened : week.pullsOpened,
    ),
  }
  const down = {
    label: kind === "issues" ? "Closed" : "Merged",
    color: SERIES.closed,
    values: insights.weekly.map((week) =>
      kind === "issues" ? week.issuesClosed : week.pullsMerged,
    ),
  }
  const noun = kind === "issues" ? "issues" : "pull requests"
  return (
    <ChartCard
      title="Throughput"
      description={`${formatCount(sum(up.values))} ${noun} opened, ${formatCount(sum(down.values))} ${down.label.toLowerCase()}, per week`}
      className="md:col-span-2"
      actions={
        <Segmented
          label="Show"
          value={kind}
          onChange={setKind}
          options={[
            { value: "issues", label: "Issues" },
            { value: "pulls", label: "Pull requests" },
          ]}
        />
      }
      table={
        <DataTable
          caption={`${noun} opened and ${down.label.toLowerCase()} per week`}
          columns={["Week", "Opened", down.label]}
          rows={insights.weekly.map((week, index) => ({
            key: week.weekStart,
            cells: [weekTitle(insights.weekly, index), up.values[index], down.values[index]],
          }))}
        />
      }
    >
      <MirrorColumns
        categories={categories}
        up={up}
        down={down}
        height={240}
        ariaLabel={`Weekly ${noun}: ${sum(up.values)} opened and ${sum(down.values)} ${down.label.toLowerCase()} over ${insights.weekly.length} weeks.`}
        tooltipTitle={(index) => weekTitle(insights.weekly, index)}
      />
      <div className="mt-3">
        <Legend
          items={[
            { label: `Opened (above)`, color: up.color },
            { label: `${down.label} (below)`, color: down.color },
          ]}
        />
      </div>
    </ChartCard>
  )
}

const Backlog = ({ insights }: { readonly insights: Insights }) => {
  const values = insights.weekly.map((week) => week.openIssues)
  const first = values[0] ?? 0
  const last = values.at(-1) ?? 0
  return (
    <ChartCard
      title="Open issues"
      description={`${formatCount(last)} open now, ${last >= first ? "up" : "down"} ${formatCount(Math.abs(last - first))} since the week of ${formatDay(insights.weekly[0]?.weekStart ?? "")}`}
      table={
        <DataTable
          caption="Open issues at the end of each week"
          columns={["Week", "Open issues"]}
          rows={insights.weekly.map((week, index) => ({
            key: week.weekStart,
            cells: [weekTitle(insights.weekly, index), week.openIssues],
          }))}
        />
      }
    >
      <AreaChart
        labels={insights.weekly.map((week) => formatDay(week.weekStart))}
        values={values}
        seriesLabel="open issues"
        partialLast
        ariaLabel={`Open issues went from ${first} to ${last} over ${values.length} weeks.`}
        tooltipTitle={(index) => weekTitle(insights.weekly, index)}
      />
    </ChartCard>
  )
}

const MergeTime = ({ insights }: { readonly insights: Insights }) => {
  const { pullMergeTime } = insights
  const merged = sum(pullMergeTime.buckets.map((bucket) => bucket.count))
  return (
    <ChartCard
      title="Time to merge"
      description={`${formatCount(merged)} pull requests merged, from opening to merge`}
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
      {merged === 0 ? (
        <Empty>No pull request was merged in this period.</Empty>
      ) : (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-2">
            {(
              [
                ["Median", pullMergeTime.p50],
                ["75th pct", pullMergeTime.p75],
                ["90th pct", pullMergeTime.p90],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-zinc-50 px-2.5 py-1.5 dark:bg-zinc-800/60">
                <dt className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                  {label}
                </dt>
                <dd className="text-sm font-semibold">
                  {value === null ? "–" : formatHours(value)}
                </dd>
              </div>
            ))}
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
            height={168}
            capLabels
            ariaLabel={`Merge time distribution: ${pullMergeTime.buckets.map((bucket) => `${bucket.label} ${bucket.count}`).join(", ")}.`}
            tooltipTitle={(index) => `Merged in ${pullMergeTime.buckets[index]?.label ?? ""}`}
          />
        </>
      )}
    </ChartCard>
  )
}

const CiHealth = ({
  ci,
  days,
}: {
  readonly ci: NonNullable<Insights["ci"]>
  readonly days: Insights["days"]
}) => (
  <ChartCard
    title="CI health"
    description={`${formatCount(ci.runs)} workflow runs in the last ${RANGE_LABELS[days].long}`}
    table={
      <DataTable
        caption="Workflow runs per week by outcome"
        columns={["Week", "Passed", "Failed", "Other"]}
        rows={ci.weekly.map((week, index) => ({
          key: week.weekStart,
          cells: [weekTitle(ci.weekly, index), week.success, week.failure, week.other],
        }))}
      />
    }
  >
    <div className="mb-3 flex items-baseline gap-4">
      <p className="text-3xl font-semibold tracking-tight">
        {ci.successRate === null ? "–" : formatPercent(ci.successRate)}
        <span className="ml-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          pass rate
        </span>
      </p>
      {ci.medianDurationMinutes !== null && (
        <p className="text-sm font-semibold">
          {formatMinutes(ci.medianDurationMinutes)}
          <span className="ml-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            median run
          </span>
        </p>
      )}
    </div>
    <StackedColumns
      categories={weekCategories(ci.weekly)}
      series={[
        { label: "passed", color: SERIES.success, values: ci.weekly.map((week) => week.success) },
        { label: "failed", color: SERIES.failure, values: ci.weekly.map((week) => week.failure) },
        { label: "other", color: SERIES.other, values: ci.weekly.map((week) => week.other) },
      ]}
      height={150}
      ariaLabel={`Weekly CI runs: ${sum(ci.weekly.map((week) => week.success))} passed, ${sum(ci.weekly.map((week) => week.failure))} failed.`}
      tooltipTitle={(index) => weekTitle(ci.weekly, index)}
    />
    <div className="mt-3">
      <Legend
        items={[
          { label: "Passed", color: SERIES.success },
          { label: "Failed", color: SERIES.failure },
          { label: "Cancelled or skipped", color: SERIES.other },
        ]}
      />
    </div>
    {ci.slowestWorkflows.length > 0 && (
      <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Slowest workflows (median)
        </h3>
        <ul className="flex flex-col gap-1.5 text-xs">
          {ci.slowestWorkflows.map((workflow) => (
            <li
              key={`${workflow.repo}/${workflow.name}`}
              className="flex items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{workflow.name}</span>{" "}
                <span className="text-zinc-500 dark:text-zinc-400">{workflow.repo}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">
                  {formatMinutes(workflow.medianDurationMinutes)}
                </span>{" "}
                <span className="text-zinc-500 dark:text-zinc-400">
                  · {formatCount(workflow.runs)} runs
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}
  </ChartCard>
)

const Activity = ({ insights }: { readonly insights: Insights }) => {
  const total = sum(insights.punchcard.flat())
  const busiest = insights.punchcard.reduce<{ day: number; hour: number; count: number }>(
    (best, hours, day) =>
      hours.reduce(
        (inner, count, hour) => (count > inner.count ? { day, hour, count } : inner),
        best,
      ),
    { day: 0, hour: 0, count: 0 },
  )
  return (
    <ChartCard
      title="When work happens"
      description={
        total === 0
          ? `Issues and pull requests opened, closed, and merged (${insights.tz})`
          : `Busiest on ${DAY_NAMES[busiest.day]} around ${String(busiest.hour).padStart(2, "0")}:00, ${insights.tz}`
      }
      className="md:col-span-2"
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

const IssueAge = ({ insights }: { readonly insights: Insights }) => {
  const open = sum(insights.issueAge.map((bucket) => bucket.count))
  return (
    <ChartCard
      title="Age of open issues"
      description={`${formatCount(open)} open issues by time since they were opened`}
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
      {open === 0 ? (
        <Empty>No open issues.</Empty>
      ) : (
        <StackedColumns
          categories={insights.issueAge.map((bucket) => ({
            key: bucket.label,
            label: bucket.label,
          }))}
          series={[
            {
              label: "open issues",
              color: SERIES.opened,
              values: insights.issueAge.map((bucket) => bucket.count),
            },
          ]}
          capLabels
          height={200}
          ariaLabel={`Open issues by age: ${insights.issueAge.map((bucket) => `${bucket.label} ${bucket.count}`).join(", ")}.`}
          tooltipTitle={(index) => `Open for ${insights.issueAge[index]?.label ?? ""}`}
        />
      )}
    </ChartCard>
  )
}

const Labels = ({ insights }: { readonly insights: Insights }) => (
  <ChartCard title="Top labels" description="On open issues">
    {insights.labels.length === 0 ? (
      <Empty>No open issue has a label.</Empty>
    ) : (
      <BarList
        ariaLabel="Labels on open issues"
        rows={insights.labels.map((label) => ({
          key: label.name,
          name: label.name,
          lead: (
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: label.color }}
            />
          ),
          segments: [{ label: "open issues", value: label.count, color: label.color }],
          display: formatCount(label.count),
        }))}
      />
    )}
  </ChartCard>
)

const Contributors = ({ insights }: { readonly insights: Insights }) => (
  <ChartCard
    title="Contributors"
    description="Pull requests merged by author, issues closed by assignee"
    actions={undefined}
  >
    {insights.contributors.length === 0 ? (
      <Empty>Nothing was merged or closed in this period.</Empty>
    ) : (
      <>
        <BarList
          ariaLabel="Contributors"
          rows={insights.contributors.map((person) => ({
            key: person.login,
            name: person.login,
            lead: <Avatar url={person.avatarUrl} name={person.login} size="sm" />,
            segments: [
              { label: "pull requests merged", value: person.pullsMerged, color: SERIES.opened },
              { label: "issues closed", value: person.issuesClosed, color: SERIES.closed },
            ],
            display: formatCount(person.pullsMerged + person.issuesClosed),
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
      </>
    )}
  </ChartCard>
)

const dueFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })

const Milestones = ({ insights }: { readonly insights: Insights }) => {
  const now = Date.parse(insights.generatedAt)
  return (
    <ChartCard title="Milestones" description="Open milestones, nearest due date first">
      {insights.milestones.length === 0 ? (
        <Empty>No open milestones.</Empty>
      ) : (
        <ul className="-mr-1 flex max-h-80 flex-col gap-3.5 overflow-y-auto pr-1">
          {insights.milestones.map((milestone) => {
            const total = milestone.openIssues + milestone.closedIssues
            const overdue =
              milestone.dueOn !== null &&
              Date.parse(milestone.dueOn) < now &&
              milestone.openIssues > 0
            return (
              <li key={milestone.url}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                  <a
                    href={milestone.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    <span className="font-medium">{milestone.title}</span>{" "}
                    <span className="text-zinc-500 dark:text-zinc-400">{milestone.repo}</span>
                  </a>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">
                      {total === 0 ? 0 : Math.round((milestone.closedIssues / total) * 100)}%
                    </span>
                  </span>
                </div>
                <Meter
                  value={milestone.closedIssues}
                  max={total}
                  tone={overdue ? "danger" : "accent"}
                  ariaLabel={`${milestone.title}: ${milestone.closedIssues} of ${total} issues closed`}
                />
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {milestone.closedIssues} of {total} closed
                  {milestone.dueOn !== null && (
                    <>
                      {" · "}
                      <span className={overdue ? "font-medium text-red-700 dark:text-red-400" : ""}>
                        {overdue ? "overdue since" : "due"}{" "}
                        {dueFormat.format(new Date(milestone.dueOn))}
                      </span>
                    </>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
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
      description="Health from CI, merge time, idle pull requests, backlog growth, activity, and milestones. Expand a row for the reasons."
      className="md:col-span-2 xl:col-span-3"
    >
      {insights.languages.length > 0 && (
        <div className="mb-5">
          <SegmentedBar
            variant="tall"
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
                <span className="text-zinc-400 tabular-nums dark:text-zinc-500">
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

/** Every card of the insights page, for one loaded payload. */
export const InsightsDashboard = ({ insights }: { readonly insights: Insights }) => {
  const { tiles, weekly } = insights
  const since = `since ${formatDay(insights.window.start)}`
  const previous = "vs period before"
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
          comparison={previous}
          trend={weekly.map((week) => week.issuesClosed)}
        />
        <StatTile
          label="Pull requests merged"
          value={tiles.pullsMerged.value}
          previous={tiles.pullsMerged.previous}
          goodWhen="up"
          comparison={previous}
          trend={weekly.map((week) => week.pullsMerged)}
        />
        <StatTile
          label="Issues opened"
          value={tiles.issuesOpened.value}
          previous={tiles.issuesOpened.previous}
          goodWhen="neutral"
          comparison={previous}
          trend={weekly.map((week) => week.issuesOpened)}
        />
        <StatTile
          label="Median time to close"
          value={tiles.medianIssueCloseHours.value}
          previous={tiles.medianIssueCloseHours.previous}
          format={formatHours}
          goodWhen="down"
          comparison={previous}
        />
        <StatTile
          label="Median time to merge"
          value={tiles.medianPullMergeHours.value}
          previous={tiles.medianPullMergeHours.previous}
          format={formatHours}
          goodWhen="down"
          comparison={previous}
        />
        <StatTile
          label="CI pass rate"
          value={tiles.ciSuccessRate.value}
          previous={tiles.ciSuccessRate.previous}
          format={formatPercent}
          goodWhen="up"
          deltaMode="points"
          comparison={
            tiles.ciSuccessRate.value === null && insights.ci === null ? "no CI data" : previous
          }
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-flow-row-dense xl:grid-cols-3">
        <Throughput insights={insights} />
        <ChartCard
          title="Needs attention"
          description="Failing CI, overdue milestones, and idle work"
        >
          <AttentionList items={insights.attention} />
        </ChartCard>
        <Backlog insights={insights} />
        <MergeTime insights={insights} />
        {insights.ci !== null && <CiHealth ci={insights.ci} days={insights.days} />}
        <Activity insights={insights} />
        <IssueAge insights={insights} />
        <Labels insights={insights} />
        <Contributors insights={insights} />
        <Milestones insights={insights} />
        <Repositories insights={insights} />
      </div>
    </div>
  )
}
