import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useSearchParams } from "wouter"
import { INSIGHT_DAYS, type InsightDays, type Insights } from "../../shared/api.ts"
import { browserTimeZone, fetchInsights } from "../api.ts"
import { relativeTime } from "../format.ts"
import { ScopeBar } from "../scope/ScopeBar.tsx"
import { useRepoSelection } from "../scope/use-repo-selection.ts"
import { InsightsDashboard } from "./InsightsDashboard.tsx"
import { incompleteNotice, insightsSummary, RANGE_LABELS } from "./summary.ts"

const DEFAULT_DAYS: InsightDays = 90
const STALE_TIME_MS = 5 * 60 * 1000

const useRange = () => {
  const [params, setParams] = useSearchParams()
  const days =
    INSIGHT_DAYS.find((allowed) => String(allowed) === params.get("days")) ?? DEFAULT_DAYS
  const setDays = (next: InsightDays) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === DEFAULT_DAYS) updated.delete("days")
        else updated.set("days", String(next))
        return updated
      },
      { replace: true },
    )
  return [days, setDays] as const
}

const RangePicker = ({
  days,
  onChange,
}: {
  readonly days: InsightDays
  readonly onChange: (days: InsightDays) => void
}) => (
  <fieldset className="flex rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
    <legend className="sr-only">Period</legend>
    {INSIGHT_DAYS.map((option) => (
      <button
        key={option}
        type="button"
        aria-pressed={days === option}
        aria-label={`Last ${RANGE_LABELS[option].long}`}
        onClick={() => onChange(option)}
        className="rounded-md px-2.5 py-1 text-sm font-medium text-zinc-600 tabular-nums hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900"
      >
        {RANGE_LABELS[option].short}
      </button>
    ))}
  </fieldset>
)

const CopySummary = ({ insights }: { readonly insights: Insights | undefined }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const copy = async () => {
    if (insights === undefined) return
    try {
      await navigator.clipboard.writeText(insightsSummary(insights))
      setState("copied")
    } catch {
      setState("failed")
    }
    window.setTimeout(() => setState("idle"), 2000)
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={insights === undefined}
      className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
        {state === "copied" ? (
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M5.5 5.5V3.75c0-.69.56-1.25 1.25-1.25h5.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25H10.5M3.75 5.5h5.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-5.5c-.69 0-1.25-.56-1.25-1.25v-5.5c0-.69.56-1.25 1.25-1.25z"
            stroke="currentColor"
            strokeWidth={1.3}
          />
        )}
      </svg>
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy summary"}
      </span>
    </button>
  )
}

const Skeleton = () => (
  <div aria-hidden="true" className="flex flex-col gap-4">
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          key={index}
          className="h-[7.25rem] animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        />
      ))}
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {["md:col-span-2 h-80", "h-80", "h-72", "h-72", "h-72"].map((size, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          key={index}
          className={`animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${size}`}
        />
      ))}
    </div>
  </div>
)

const Notice = ({ title, children }: { readonly title: string; readonly children: string }) => (
  <section className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
    <svg
      viewBox="0 0 24 24"
      className="mx-auto mb-3 size-8 text-zinc-400"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 19V9M10 19V5M16 19v-7M22 19H2"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
    <h2 className="text-sm font-semibold">{title}</h2>
    <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
  </section>
)

export const InsightsPage = ({ org }: { org: string }) => {
  const repoSelection = useRepoSelection(org)
  const [days, setDays] = useRange()
  const [tz] = useState(browserTimeZone)
  const chosen = repoSelection.selected.length > 0
  const insights = useQuery({
    queryKey: ["insights", org, repoSelection.selection, days, tz],
    queryFn: () => fetchInsights(org, repoSelection.selected, days, tz),
    enabled: chosen,
    staleTime: STALE_TIME_MS,
    placeholderData: keepPreviousData,
  })
  const data = chosen ? insights.data : undefined

  return (
    <main className="pb-12">
      <ScopeBar org={org} view="insights" repoSelection={repoSelection}>
        <RangePicker days={days} onChange={setDays} />
        <CopySummary insights={data} />
      </ScopeBar>
      <div className="px-4 sm:px-6">
        <p className="sr-only" aria-live="polite">
          {insights.isFetching ? "Loading insights" : ""}
        </p>
        {!chosen ? (
          <Notice title="Choose repositories">
            Pick one or more repositories above to see their throughput, backlog, CI health, and
            what needs attention.
          </Notice>
        ) : data === undefined ? (
          insights.isError ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              <p>Could not load insights: {insights.error.message}</p>
              <button
                type="button"
                onClick={() => void insights.refetch()}
                className="rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-red-800 dark:hover:bg-red-900"
              >
                Retry
              </button>
            </div>
          ) : (
            <Skeleton />
          )
        ) : (
          <div className={`transition-opacity ${insights.isPlaceholderData ? "opacity-60" : ""}`}>
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Last {RANGE_LABELS[data.days].long} across {data.repoStats.length}{" "}
              {data.repoStats.length === 1 ? "repository" : "repositories"}, weeks and hours in{" "}
              {data.tz}. Updated {relativeTime(data.generatedAt)}.
            </p>
            {insights.isError && (
              <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">
                Could not refresh: {insights.error.message}
              </p>
            )}
            {data.failedRepos.length > 0 && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                Left out because they failed to load:{" "}
                {data.failedRepos.map((failed) => `${failed.repo} (${failed.message})`).join(", ")}
              </div>
            )}
            {data.incomplete.length > 0 && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                {incompleteNotice(data.incomplete)}
              </div>
            )}
            {data.repoStats.length === 0 ? (
              <Notice title="No repository loaded">
                Every chosen repository failed to load. Check that you can still open them in
                Forgejo, then reload.
              </Notice>
            ) : (
              <InsightsDashboard insights={data} />
            )}
          </div>
        )}
      </div>
    </main>
  )
}
