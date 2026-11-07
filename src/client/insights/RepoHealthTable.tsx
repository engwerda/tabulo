import { Fragment, useState } from "react"
import type { HealthStatus, Language, RepoInsight } from "../../shared/api.ts"
import { SegmentedBar } from "../charts/SegmentedBar.tsx"
import { Sparkline } from "../charts/Sparkline.tsx"
import { formatCount, formatPercent } from "../charts/scale.ts"
import { relativeTime } from "../format.ts"

const STATUS: Record<
  HealthStatus,
  { readonly label: string; readonly icon: string; readonly pill: string; readonly ring: string }
> = {
  strong: {
    label: "Strong",
    icon: "M3.5 8.5l3 3 6-7",
    pill: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20",
    ring: "var(--chart-positive)",
  },
  watch: {
    label: "Watch",
    icon: "M8 4v5M8 12h.01",
    pill: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20",
    ring: "#d08700",
  },
  risky: {
    label: "Risky",
    icon: "M4.5 4.5l7 7m0-7l-7 7",
    pill: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/20",
    ring: "var(--chart-negative)",
  },
}

/** The score as a ring that fills to it, in the status color. */
const ScoreRing = ({
  score,
  status,
}: {
  readonly score: number
  readonly status: HealthStatus
}) => {
  const circumference = 2 * Math.PI * 14
  return (
    <span className="relative grid size-9 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={18} cy={18} r={14} fill="none" strokeWidth={3} className="stroke-chart-grid" />
        <circle
          cx={18}
          cy={18}
          r={14}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          style={{ stroke: STATUS[status].ring }}
        />
      </svg>
      <span className="text-[11px] font-semibold tabular-nums">{score}</span>
    </span>
  )
}

export const StatusPill = ({ status }: { readonly status: HealthStatus }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS[status].pill}`}
  >
    <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden="true">
      <path
        d={STATUS[status].icon}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    {STATUS[status].label}
  </span>
)

const Chevron = ({ open }: { readonly open: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
    fill="none"
    aria-hidden="true"
  >
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
  </svg>
)

const COLUMNS = [
  "Repository",
  "Health",
  "Open issues",
  "Open PRs",
  "Closed",
  "Merged",
  "CI pass rate",
  "Activity",
  "Languages",
  "Last activity",
]

/**
 * One row per repository, riskiest first. A row expands to list the health rules that cost it
 * points.
 */
export const RepoHealthTable = ({
  repos,
  languageColor,
}: {
  readonly repos: ReadonlyArray<RepoInsight>
  readonly languageColor: (language: Language) => string
}) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const toggle = (name: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const sorted = [...repos].sort(
    (a, b) => a.health.score - b.health.score || a.name.localeCompare(b.name),
  )
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="text-xs text-zinc-500 dark:text-zinc-400">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            {COLUMNS.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={`px-3 py-2 font-medium whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5 ${index >= 2 && index <= 6 ? "text-right" : ""}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((repo) => {
            const open = expanded.has(repo.name)
            const detailsId = `repo-health-${repo.name}`
            return (
              <Fragment key={repo.name}>
                <tr className="border-b border-zinc-100 hover:bg-zinc-50/70 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30">
                  <th scope="row" className="py-2.5 pr-3 pl-4 font-medium sm:pl-5">
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={detailsId}
                        onClick={() => toggle(repo.name)}
                        className="grid size-6 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      >
                        <Chevron open={open} />
                        <span className="sr-only">Health details for {repo.name}</span>
                      </button>
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                      >
                        {repo.name}
                      </a>
                      {repo.archived && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          archived
                        </span>
                      )}
                    </span>
                  </th>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <ScoreRing score={repo.health.score} status={repo.health.status} />
                      <StatusPill status={repo.health.status} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCount(repo.openIssues)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCount(repo.openPulls)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCount(repo.issuesClosed)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCount(repo.pullsMerged)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {repo.ci === null || repo.ci.successRate === null ? (
                      <span className="text-zinc-400 dark:text-zinc-600">–</span>
                    ) : (
                      formatPercent(repo.ci.successRate)
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Sparkline
                      values={repo.activity}
                      width={88}
                      height={24}
                      ariaLabel={`Weekly activity in ${repo.name}: ${repo.activity.join(", ")}`}
                    />
                  </td>
                  <td className="w-40 px-3 py-2.5">
                    {repo.languages.length === 0 ? (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">None</span>
                    ) : (
                      <SegmentedBar
                        ariaLabel={`Languages in ${repo.name}`}
                        segments={repo.languages.map((language) => ({
                          label: language.name,
                          value: language.bytes,
                          color: languageColor(language),
                        }))}
                      />
                    )}
                  </td>
                  <td
                    className="py-2.5 pr-4 pl-3 text-xs whitespace-nowrap text-zinc-500 sm:pr-5 dark:text-zinc-400"
                    title={new Date(repo.lastActivity).toLocaleString()}
                  >
                    {relativeTime(repo.lastActivity)}
                  </td>
                </tr>
                <tr id={detailsId} hidden={!open} className="bg-zinc-50/70 dark:bg-zinc-950/40">
                  <td colSpan={COLUMNS.length} className="px-4 py-3 sm:px-5">
                    {repo.health.reasons.length === 0 ? (
                      <p className="pl-8 text-xs text-zinc-600 dark:text-zinc-400">
                        No health rule took points off {repo.name}.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1 pl-8 text-xs text-zinc-700 dark:text-zinc-300">
                        {repo.health.reasons.map((reason) => (
                          <li key={reason} className="flex items-center gap-2">
                            <span
                              className="size-1.5 rounded-full bg-zinc-400"
                              aria-hidden="true"
                            />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
