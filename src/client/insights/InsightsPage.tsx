import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { useSearchParams } from "wouter"
import { INSIGHT_DAYS, type InsightDays, type Insights } from "../../shared/api.ts"
import { browserTimeZone, fetchInsights } from "../api.ts"
import { formatSpan } from "../charts/scale.ts"
import { relativeTime } from "../format.ts"
import { ChooseRepos } from "../scope/ChooseRepos.tsx"
import { ScopeBar } from "../scope/ScopeBar.tsx"
import { useRepoSelection } from "../scope/use-repo-selection.ts"
import { PageTitle } from "../ui/PageTitle.tsx"
import { buttonClass, cardClass, Segmented } from "../ui/primitives.tsx"
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

const CopyIcon = ({ copied }: { readonly copied: boolean }) => (
  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
    {copied ? (
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
      title="Copy the headline numbers as Markdown"
      className={`${buttonClass.secondary} shrink-0`}
    >
      <CopyIcon copied={state === "copied"} />
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy summary"}
      </span>
    </button>
  )
}

const bar = "animate-shimmer rounded bg-zinc-200/70 dark:bg-zinc-800"

/** A card placeholder: its title and description lines over an empty plot. */
const CardPlaceholder = ({ className }: { readonly className: string }) => (
  <div className={`${cardClass} flex flex-col gap-2 p-4 sm:p-5 ${className}`}>
    <div className={`h-3.5 w-28 ${bar}`} />
    <div className={`h-3 w-44 ${bar}`} />
    <div className="mt-4 flex-1 animate-shimmer rounded-lg bg-zinc-100 dark:bg-zinc-800/50" />
  </div>
)

/** Placeholders in the shape of the dashboard: the headline numbers, then two rows of cards. */
const Skeleton = () => (
  <div role="status" className="flex flex-col gap-4">
    <span className="sr-only">Loading insights…</span>
    <div className={`${cardClass} overflow-hidden`}>
      <div className="grid grid-cols-2 gap-px bg-zinc-200/80 lg:grid-cols-4 dark:bg-zinc-800">
        {["open", "pulls", "closed", "merged"].map((key) => (
          <div
            key={key}
            className="flex flex-col gap-2.5 bg-white px-4 py-3.5 sm:px-5 sm:py-4 dark:bg-zinc-900"
          >
            <div className={`h-3 w-24 ${bar}`} />
            <div className={`h-6 w-12 ${bar}`} />
            <div className={`h-3 w-32 ${bar}`} />
          </div>
        ))}
      </div>
      <div className="h-[3.75rem] border-t border-zinc-200/80 dark:border-zinc-800" />
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <CardPlaceholder className="h-[26rem] lg:col-span-2" />
      <CardPlaceholder className="h-[26rem] max-lg:hidden" />
    </div>
    <div className="grid gap-4 max-md:hidden md:grid-cols-2 lg:grid-cols-3">
      <CardPlaceholder className="h-96" />
      <CardPlaceholder className="h-96" />
      <CardPlaceholder className="h-96 max-lg:hidden" />
    </div>
  </div>
)

const ChartsIcon = () => (
  <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
    <path
      d="M3 13V8.5M6.5 13V4M10 13V7M13.5 13V2.5"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </svg>
)

const AlertIcon = () => (
  <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden="true">
    <path
      d="M8 5v3.5M8 11h.01M14 8A6 6 0 112 8a6 6 0 0112 0z"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </svg>
)

/** A compact block for a page that has nothing to chart: one icon, a title, and a sentence. */
const Notice = ({ title, children }: { readonly title: string; readonly children: string }) => (
  <section className={`${cardClass} flex items-start gap-3 px-4 py-4 sm:px-5`}>
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      <ChartsIcon />
    </span>
    <div className="min-w-0">
      <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{children}</p>
    </div>
  </section>
)

/** A problem with the data on the page, with its explanation and an optional retry. */
const Problem = ({
  tone,
  children,
  onRetry,
  retrying = false,
}: {
  readonly tone: "error" | "warning"
  readonly children: ReactNode
  readonly onRetry?: () => void
  readonly retrying?: boolean
}) => (
  <div role="alert" className={`${cardClass} flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5`}>
    <span
      className={
        tone === "error" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
      }
    >
      <AlertIcon />
    </span>
    <p className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300">{children}</p>
    {onRetry !== undefined && (
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className={`${buttonClass.secondary} shrink-0`}
      >
        Retry
      </button>
    )}
  </div>
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
    <main>
      <ScopeBar org={org} view="insights" repoSelection={repoSelection} />
      <div className="mx-auto max-w-screen-2xl px-4 pb-8 sm:px-6">
        <PageTitle
          title="Insights"
          meta={
            data === undefined ? (
              `The last ${RANGE_LABELS[days].long}`
            ) : (
              <>
                <span className="tabular-nums">
                  {formatSpan(data.window.start, data.window.end)}
                </span>
                {" · "}
                {data.repoStats.length}{" "}
                {data.repoStats.length === 1 ? "repository" : "repositories"}
                {" · "}
                <span title={`Weeks and hours are in ${data.tz}`}>{data.tz}</span>
                <span className="max-sm:hidden">
                  {" · "}updated {relativeTime(data.generatedAt)}
                </span>
              </>
            )
          }
          actions={
            <>
              <Segmented
                label="Period"
                value={String(days)}
                onChange={(next) =>
                  setDays(INSIGHT_DAYS.find((option) => String(option) === next) ?? DEFAULT_DAYS)
                }
                options={INSIGHT_DAYS.map((option) => ({
                  value: String(option),
                  label: RANGE_LABELS[option].short,
                  title: `Last ${RANGE_LABELS[option].long}`,
                }))}
              />
              <CopySummary insights={data} />
            </>
          }
        />
        <p className="sr-only" aria-live="polite">
          {insights.isFetching ? "Loading insights" : ""}
        </p>
        {repoSelection.resolving ? (
          <Skeleton />
        ) : !chosen ? (
          <ChooseRepos org={org} view="insights" repoSelection={repoSelection}>
            Pick one or more repositories to see their throughput, backlog, CI health, and what
            needs attention.
          </ChooseRepos>
        ) : data === undefined ? (
          insights.isError ? (
            <Problem
              tone="error"
              onRetry={() => void insights.refetch()}
              retrying={insights.isFetching}
            >
              Could not load insights.{" "}
              <span className="text-zinc-500 dark:text-zinc-400">{insights.error.message}</span>
            </Problem>
          ) : (
            <Skeleton />
          )
        ) : (
          <div
            className={`flex flex-col gap-4 transition-opacity ${insights.isPlaceholderData ? "opacity-60" : ""}`}
          >
            {insights.isError && (
              <Problem
                tone="error"
                onRetry={() => void insights.refetch()}
                retrying={insights.isFetching}
              >
                Could not refresh; showing the last loaded numbers.{" "}
                <span className="text-zinc-500 dark:text-zinc-400">{insights.error.message}</span>
              </Problem>
            )}
            {data.failedRepos.length > 0 && (
              <Problem tone="warning">
                Left out because they failed to load:{" "}
                {data.failedRepos.map((failed) => `${failed.repo} (${failed.message})`).join(", ")}
              </Problem>
            )}
            {data.incomplete.length > 0 && (
              <Problem tone="warning">{incompleteNotice(data.incomplete)}</Problem>
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
