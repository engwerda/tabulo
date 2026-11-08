import { Fragment, type ReactNode, useState } from "react"
import type { HealthStatus, InsightGrain, Language, RepoInsight } from "../../shared/api.ts"
import { SegmentedBar } from "../charts/SegmentedBar.tsx"
import { Sparkline } from "../charts/Sparkline.tsx"
import { formatCount, formatPercent } from "../charts/scale.ts"
import { relativeTime } from "../format.ts"
import { touchTarget } from "../ui/primitives.tsx"
import { GRAIN_WORDS } from "./periods.ts"

const STATUS: Record<
  HealthStatus,
  { readonly label: string; readonly icon: string; readonly pill: string }
> = {
  strong: {
    label: "Strong",
    icon: "M3.5 8.5l3 3 6-7",
    pill: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-400/20",
  },
  watch: {
    label: "Watch",
    icon: "M8 4v5M8 12h.01",
    pill: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-400/20",
  },
  risky: {
    label: "Risky",
    icon: "M4.5 4.5l7 7m0-7l-7 7",
    pill: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-400/20",
  },
}

const StatusPill = ({ status }: { readonly status: HealthStatus }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS[status].pill}`}
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

const Missing = ({ label }: { readonly label: string }) => (
  <span className="text-zinc-500 dark:text-zinc-400" title={label}>
    –<span className="sr-only">{label}</span>
  </span>
)

/**
 * The health rules that had nothing to read for a repository in this period. Its score then
 * rests on the other rules only, which the table says rather than let a 100 overstate.
 */
const unscored = (repo: RepoInsight) => [
  ...(repo.ci === null || repo.ci.successRate === null
    ? [{ short: "CI", long: "CI, because no run passed or failed" }]
    : []),
  ...(repo.pullsMerged === 0
    ? [{ short: "merges", long: "time to merge, because nothing was merged" }]
    : []),
]

const ciRate = (repo: RepoInsight) =>
  repo.ci === null || repo.ci.successRate === null ? null : repo.ci.successRate

type Column = {
  readonly key: string
  readonly header: string
  /** Shown from this breakpoint up; below it the expanded row lists the value. */
  readonly from: "all" | "sm" | "md" | "lg"
  readonly numeric: boolean
  readonly cell: (repo: RepoInsight) => ReactNode
}

const FROM = {
  all: "",
  sm: "max-sm:hidden",
  md: "max-md:hidden",
  lg: "max-lg:hidden",
} as const

/**
 * One row per repository, riskiest first. A row expands to list the health rules that cost it
 * points and what the score could not take into account. Columns that are empty for every row
 * are left out.
 */
export const RepoHealthTable = ({
  repos,
  grain,
  languageColor,
}: {
  readonly repos: ReadonlyArray<RepoInsight>
  /** What each point of a repository's activity counts. */
  readonly grain: InsightGrain
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
  const anyCi = repos.some((repo) => ciRate(repo) !== null)
  const anyLanguages = repos.some((repo) => repo.languages.length > 0)
  const columns: ReadonlyArray<Column> = [
    {
      key: "issues",
      header: "Open issues",
      from: "all",
      numeric: true,
      cell: (repo) => formatCount(repo.openIssues),
    },
    {
      key: "pulls",
      header: "Open PRs",
      from: "sm",
      numeric: true,
      cell: (repo) => formatCount(repo.openPulls),
    },
    {
      key: "closed",
      header: "Closed",
      from: "md",
      numeric: true,
      cell: (repo) => formatCount(repo.issuesClosed),
    },
    {
      key: "merged",
      header: "Merged",
      from: "md",
      numeric: true,
      cell: (repo) => formatCount(repo.pullsMerged),
    },
    ...(anyCi
      ? [
          {
            key: "ci",
            header: "CI pass rate",
            from: "md",
            numeric: true,
            cell: (repo: RepoInsight) => {
              const rate = ciRate(repo)
              return rate === null ? <Missing label="No CI runs" /> : formatPercent(rate)
            },
          } as const,
        ]
      : []),
    {
      key: "activity",
      header: "Activity",
      from: "lg",
      numeric: false,
      cell: (repo) => (
        <Sparkline
          values={repo.activity}
          width={88}
          height={22}
          ariaLabel={`${GRAIN_WORDS[grain].adjective} activity in ${repo.name}: ${repo.activity.join(", ")}`}
        />
      ),
    },
    ...(anyLanguages
      ? [
          {
            key: "languages",
            header: "Languages",
            from: "lg",
            numeric: false,
            cell: (repo: RepoInsight) =>
              repo.languages.length === 0 ? (
                <Missing label="No languages detected" />
              ) : (
                <SegmentedBar
                  ariaLabel={`Languages in ${repo.name}`}
                  segments={repo.languages.map((language) => ({
                    label: language.name,
                    value: language.bytes,
                    color: languageColor(language),
                  }))}
                />
              ),
          } as const,
        ]
      : []),
    {
      key: "last",
      header: "Last activity",
      from: "md",
      numeric: false,
      cell: (repo) => (
        <span
          className="text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400"
          title={new Date(repo.lastActivity).toLocaleString()}
        >
          {relativeTime(repo.lastActivity)}
        </span>
      ),
    },
  ]
  const hiddenOnPhone = columns.filter((column) => column.from !== "all")

  return (
    <div className="-mx-4 sm:-mx-5">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500 dark:text-zinc-400">
          <tr className="border-y border-zinc-200/80 dark:border-zinc-800">
            <th scope="col" className="py-2 pr-3 pl-4 font-medium sm:pl-5">
              Repository
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Health
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-3 py-2 font-medium whitespace-nowrap last:pr-4 sm:last:pr-5 ${column.numeric ? "text-right" : ""} ${FROM[column.from]}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((repo) => {
            const open = expanded.has(repo.name)
            const detailsId = `repo-health-${repo.name}`
            const missing = unscored(repo)
            return (
              <Fragment key={repo.name}>
                <tr className="border-b border-zinc-100 hover:bg-zinc-50/70 dark:border-zinc-800/70 dark:hover:bg-zinc-800/30">
                  {/* On touch the name's link fills the cell, beside the details button. */}
                  <th scope="row" className="relative py-2.5 pr-3 pl-2 font-medium sm:pl-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={detailsId}
                        onClick={() => toggle(repo.name)}
                        className={`z-10 grid size-6 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${touchTarget}`}
                      >
                        <Chevron open={open} />
                        <span className="sr-only">Health details for {repo.name}</span>
                      </button>
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-zinc-900 pointer-coarse:before:absolute pointer-coarse:before:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-100"
                      >
                        {repo.name}
                        <span className="sr-only"> (opens in Forgejo)</span>
                      </a>
                      {repo.archived && (
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-2xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          archived
                        </span>
                      )}
                    </span>
                  </th>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="w-6 text-right font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                        {repo.health.score}
                      </span>
                      <StatusPill status={repo.health.status} />
                    </span>
                    {missing.length > 0 && (
                      <span className="mt-0.5 block pl-8 text-2xs whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                        Without {missing.map((entry) => entry.short).join(" or ")}
                      </span>
                    )}
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-3 py-2.5 last:pr-4 sm:last:pr-5 ${column.numeric ? "text-right tabular-nums" : ""} ${column.key === "languages" ? "w-36" : ""} ${FROM[column.from]}`}
                    >
                      {column.cell(repo)}
                    </td>
                  ))}
                </tr>
                <tr
                  id={detailsId}
                  hidden={!open}
                  className="border-b border-zinc-100 bg-zinc-50/70 dark:border-zinc-800/70 dark:bg-zinc-950/40"
                >
                  <td colSpan={columns.length + 2} className="py-3 pr-4 pl-10 sm:pr-5 sm:pl-11">
                    <div className="flex flex-col gap-2 text-xs">
                      {repo.health.reasons.length === 0 ? (
                        <p className="text-zinc-600 dark:text-zinc-400">
                          No health rule took points off {repo.name}.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1 text-zinc-700 dark:text-zinc-300">
                          {repo.health.reasons.map((reason) => (
                            <li key={reason} className="flex items-center gap-2">
                              <span
                                className="size-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-500"
                                aria-hidden="true"
                              />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      )}
                      {missing.length > 0 && (
                        <p className="text-zinc-500 dark:text-zinc-400">
                          Not scored: {missing.map((entry) => entry.long).join("; ")}.
                        </p>
                      )}
                      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500 md:hidden dark:text-zinc-400">
                        {hiddenOnPhone
                          .filter((column) => column.from !== "lg")
                          .map((column) => (
                            <div
                              key={column.key}
                              className={`flex gap-1.5 ${column.from === "sm" ? "sm:hidden" : ""}`}
                            >
                              <dt>{column.header}</dt>
                              <dd className="font-medium text-zinc-800 tabular-nums dark:text-zinc-200">
                                {column.cell(repo)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </div>
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
