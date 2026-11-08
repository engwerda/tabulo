import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useSearchParams } from "wouter"
import { INSIGHT_DAYS, type InsightDays, type Insights } from "../../shared/api.ts"
import { browserTimeZone, fetchInsights } from "../api.ts"
import { formatSpan } from "../charts/scale.ts"
import { relativeTime } from "../format.ts"
import { ChooseRepos } from "../scope/ChooseRepos.tsx"
import { ScopeBar } from "../scope/ScopeBar.tsx"
import { useRepoSelection } from "../scope/use-repo-selection.ts"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
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

/** The repositories that failed to load, each with Forgejo's reason. */
const failures = (failed: Insights["failedRepos"]) =>
  failed.map(({ repo, message }) => `${repo} (${message})`).join(", ")

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
      <div className="mx-auto max-w-screen-2xl px-4 pb-8 sm:px-6">
        <ScopeBar org={org} view="insights" repoSelection={repoSelection} />
        <PageTitle
          title="Insights"
          meta={
            data === undefined ? (
              `The last ${RANGE_LABELS[days].long}`
            ) : (
              <>
                <span
                  className="tabular-nums"
                  title={`From the Monday of the week ${data.days} days ago, so every week is whole`}
                >
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
                  title: `Last ${RANGE_LABELS[option].long}, in whole weeks`,
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
            <ErrorNotice
              title="Could not load insights"
              onRetry={() => void insights.refetch()}
              retrying={insights.isFetching}
            >
              {insights.error.message}
            </ErrorNotice>
          ) : (
            <Skeleton />
          )
        ) : (
          <div
            className={`flex flex-col gap-4 transition-opacity ${insights.isPlaceholderData ? "opacity-60" : ""}`}
          >
            {insights.isError && (
              <ErrorNotice
                title="Could not refresh insights"
                onRetry={() => void insights.refetch()}
                retrying={insights.isFetching}
              >
                Showing the last loaded numbers. {insights.error.message}
              </ErrorNotice>
            )}
            {data.repoStats.length === 0 ? (
              <ErrorNotice
                title="No repository loaded"
                onRetry={() => void insights.refetch()}
                retrying={insights.isFetching}
              >
                Every chosen repository failed to load: {failures(data.failedRepos)}. Check that you
                can still open them in Forgejo.
              </ErrorNotice>
            ) : (
              <>
                {data.failedRepos.length > 0 && (
                  <ErrorNotice
                    tone="warning"
                    title={`${data.failedRepos.length === 1 ? "1 repository" : `${data.failedRepos.length} repositories`} left out`}
                  >
                    {data.failedRepos.length === 1 ? "It" : "They"} failed to load:{" "}
                    {failures(data.failedRepos)}.
                  </ErrorNotice>
                )}
                {data.incomplete.length > 0 && (
                  <ErrorNotice tone="warning" title="Some numbers are incomplete">
                    {incompleteNotice(data.incomplete)}
                  </ErrorNotice>
                )}
                <InsightsDashboard insights={data} />
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
