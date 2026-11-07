import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "wouter"
import { fetchEpics } from "../api.ts"
import { ScopeBar } from "../scope/ScopeBar.tsx"
import { useRepoSelection } from "../scope/use-repo-selection.ts"
import { EpicCard } from "./EpicCard.tsx"
import { epicSummary, readEpicFilters, visibleEpics } from "./epics-view.ts"

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
const control = `min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 ${focus}`

const LoadingEpics = () => (
  <div role="status">
    <span className="sr-only">Loading epics</span>
    <div aria-hidden="true" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map((key) => (
        <div
          key={key}
          className="motion-safe:animate-pulse rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="h-3 w-24 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="mt-5 h-5 w-3/4 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="mt-3 h-5 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="mt-10 h-8 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="mt-4 h-3 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="mt-10 h-4 w-1/3 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  </div>
)

export const EpicsPage = ({ org }: { org: string }) => {
  const repoSelection = useRepoSelection(org)
  const [params, setParams] = useSearchParams()
  const filters = readEpicFilters(params)
  const hasSelection = repoSelection.selection !== ""
  const epics = useQuery({
    queryKey: ["epics", org, repoSelection.selection],
    queryFn: () => fetchEpics(org, repoSelection.selected),
    enabled: hasSelection,
    refetchInterval: 60_000,
  })
  const set = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === "") next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  const clearFilters = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const key of ["q", "state", "assignee"]) next.delete(key)
        return next
      },
      { replace: true },
    )
  const filtered = filters.text !== "" || filters.state !== "" || filters.assignee !== ""
  const all = epics.data?.epics ?? []
  const shown = visibleEpics(all, params)
  const summary = epicSummary(all)
  const assignees = [
    ...new Set([
      filters.assignee,
      ...all.flatMap((epic) => epic.assignees.map(({ login }) => login)),
    ]),
  ]
    .filter(Boolean)
    .sort()

  return (
    <main className="py-4">
      <ScopeBar org={org} view="epics" repoSelection={repoSelection}>
        {epics.data !== undefined && hasSelection && (
          <search
            aria-label="Filter epics"
            className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:flex-1"
          >
            <label className="min-w-48 flex-1 sm:max-w-72">
              <span className="sr-only">Search epics</span>
              <input
                type="search"
                placeholder="Search epics or #number"
                value={filters.text}
                onChange={(event) => set("q", event.target.value)}
                className={`${control} w-full`}
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">Epic state</span>
              <select
                value={filters.state ?? ""}
                onChange={(event) => set("state", event.target.value)}
                className={control}
              >
                <option value="">All states</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="min-w-0 max-w-full">
              <span className="sr-only">Assignee</span>
              <select
                value={filters.assignee}
                onChange={(event) => set("assignee", event.target.value)}
                className={control}
              >
                <option value="">Any assignee</option>
                {assignees.map((login) => (
                  <option key={login} value={login}>
                    {login}
                  </option>
                ))}
              </select>
            </label>
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
                className={`rounded-md px-2 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950 ${focus}`}
              >
                Clear filters
              </button>
            )}
          </search>
        )}
      </ScopeBar>
      <div className="mx-auto max-w-screen-2xl px-4 pb-8 sm:px-6">
        <div className="mt-5 mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Epics</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Track progress across your repositories.
            </p>
          </div>
          {epics.data !== undefined && hasSelection && (
            <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              Sort by
              <select
                value={filters.sort ?? "updated"}
                onChange={(event) =>
                  set("sort", event.target.value === "updated" ? "" : event.target.value)
                }
                className={control}
              >
                <option value="updated">Recently updated</option>
                <option value="progress">Most progress</option>
                <option value="children">Most children</option>
              </select>
            </label>
          )}
        </div>
        {epics.isError && hasSelection && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            Could not {epics.data === undefined ? "load" : "refresh"} epics: {epics.error.message}{" "}
            <button
              type="button"
              onClick={() => void epics.refetch()}
              className={`rounded-sm font-medium underline ${focus}`}
            >
              Retry
            </button>
          </div>
        )}
        {hasSelection && (epics.data?.failedRepos.length ?? 0) > 0 && (
          <div
            role="status"
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            Some repositories could not be loaded:{" "}
            {epics.data?.failedRepos.map(({ repo, message }) => `${repo} (${message})`).join(", ")}.{" "}
            <button
              type="button"
              onClick={() => void epics.refetch()}
              className={`rounded-sm font-medium underline ${focus}`}
            >
              Retry
            </button>
          </div>
        )}
        {!hasSelection ? (
          <section className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
            <h3 className="font-semibold">Choose where to look</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              Use Repositories above to choose the work you want to track.
            </p>
          </section>
        ) : epics.data === undefined ? (
          epics.isError ? null : (
            <LoadingEpics />
          )
        ) : (
          <>
            <dl
              aria-label="Epic summary for chosen repositories"
              className="mb-7 grid grid-cols-3 divide-x divide-zinc-200 rounded-xl border border-zinc-200 bg-white py-5 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="px-3 sm:px-5">
                <dt className="min-h-8 text-xs text-zinc-500 sm:min-h-0 dark:text-zinc-400">
                  Epics
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                  {all.length}
                </dd>
                <dd className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Across your repositories
                </dd>
              </div>
              <div className="px-3 sm:px-5">
                <dt className="min-h-8 text-xs text-zinc-500 sm:min-h-0 dark:text-zinc-400">
                  Overall completion
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                  {summary.percent}
                  <span className="text-lg text-zinc-400">%</span>
                </dd>
                <dd className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {summary.done} of {summary.total} children done
                </dd>
              </div>
              <div className="px-3 sm:px-5">
                <dt className="min-h-8 text-xs text-zinc-500 sm:min-h-0 dark:text-zinc-400">
                  At risk
                </dt>
                <dd
                  className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${summary.atRisk > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}
                >
                  {summary.atRisk}
                </dd>
                <dd className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Open, with no children done
                </dd>
              </div>
            </dl>
            <p aria-live="polite" className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              {filtered
                ? `${shown.length} of ${all.length} epics`
                : `${all.length} ${all.length === 1 ? "epic" : "epics"}`}
              <span className="sr-only">{epics.isFetching ? ", refreshing" : ""}</span>
            </p>
            {shown.length > 0 ? (
              <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {shown.map((epic) => (
                  <EpicCard key={epic.key} epic={epic} columns={epics.data.columns} />
                ))}
              </div>
            ) : (
              <section className="rounded-xl border border-dashed border-zinc-300 px-5 py-12 text-center dark:border-zinc-700">
                <h3 className="font-semibold">
                  {filtered
                    ? "No epics match your filters"
                    : epics.data.failedRepos.length === repoSelection.selected.length
                      ? "No epics could be loaded"
                      : "No epics yet"}
                </h3>
                {filtered ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`mt-3 rounded-md px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950 ${focus}`}
                  >
                    Clear filters
                  </button>
                ) : (
                  epics.data.failedRepos.length !== repoSelection.selected.length && (
                    <div className="mx-auto max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                      <p className="mt-2">
                        Add the epic label to a Forgejo issue, then reference its children in the
                        body:
                      </p>
                      <pre className="mx-auto mt-5 w-fit max-w-full overflow-x-auto rounded-lg border border-zinc-200 bg-white px-5 py-3 text-left text-xs leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                        {"- [ ] #12\n- [ ] repo#34\n- [ ] owner/repo#56"}
                      </pre>
                      <p className="mt-4 text-xs">
                        Progress follows each child's real state in Forgejo.
                      </p>
                    </div>
                  )
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
