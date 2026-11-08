import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useSearchParams } from "wouter"
import { Avatar } from "../Avatar.tsx"
import { fetchEpics, fetchInstance, fetchOrgRepos } from "../api.ts"
import { Glyph } from "../palette/icons.tsx"
import { ChooseRepos } from "../scope/ChooseRepos.tsx"
import { ScopeBar } from "../scope/ScopeBar.tsx"
import { useRepoSelection } from "../scope/use-repo-selection.ts"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import { CopyIcon, ExternalIcon, SortIcon, XIcon } from "../ui/icons.tsx"
import { PageTitle } from "../ui/PageTitle.tsx"
import {
  buttonClass,
  cardClass,
  MenuOption,
  Popover,
  Segmented,
  touchTarget,
} from "../ui/primitives.tsx"
import { SearchField } from "../ui/SearchField.tsx"
import { useToast } from "../ui/toast.tsx"
import { EpicCard } from "./EpicCard.tsx"
import {
  epicSummary,
  incompleteNotice,
  readEpicFilters,
  readOpenEpics,
  visibleEpics,
  withEpicOpen,
} from "./epics-view.ts"

const CHILD_EXAMPLE = "- [ ] #12\n- [ ] repo#34\n- [ ] owner/repo#56"

const STATES = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const

const SORTS = [
  { value: "updated", label: "Recently updated", short: "Updated" },
  { value: "progress", label: "Most progress", short: "Progress" },
  { value: "children", label: "Most children", short: "Children" },
] as const

const LoadingEpics = () => (
  <div role="status">
    <span className="sr-only">Loading epics</span>
    <div aria-hidden="true">
      <div className={`${cardClass} h-[5.5rem] animate-shimmer`} />
      <div className="mt-6 h-8 w-full max-w-md animate-shimmer rounded-lg bg-zinc-200/60 dark:bg-zinc-800/60" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((key) => (
          <div key={key} className={`${cardClass} p-5 max-lg:[&:nth-child(n+2)]:hidden`}>
            <div className="h-3 w-20 animate-shimmer rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-3 h-4 w-3/4 animate-shimmer rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-3 h-4 w-1/3 animate-shimmer rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-7 h-2 animate-shimmer rounded-full bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-3 h-3 w-1/2 animate-shimmer rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-6 h-6 w-24 animate-shimmer rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  </div>
)

/** A menu of single choices behind a button, for the assignee and the sort order. */
const ChoiceMenu = <T extends string>({
  name,
  label,
  value,
  options,
  onChange,
  align = "start",
  triggerClass = buttonClass.secondary,
}: {
  name: string
  label: ReactNode
  value: T
  options: ReadonlyArray<{ readonly value: T; readonly label: ReactNode }>
  onChange: (value: T) => void
  align?: "start" | "end"
  triggerClass?: string
}) => (
  <Popover
    label={label}
    align={align}
    focusFirstItem
    triggerClass={`${triggerClass} min-w-0`}
    containerClass="relative min-w-0"
    panelClass="w-56 p-1.5"
  >
    {(close) => (
      <div role="menu" aria-label={name} className="scroll-thin max-h-72 overflow-y-auto">
        {options.map((option) => (
          <MenuOption
            key={option.value}
            selected={option.value === value}
            onSelect={() => {
              onChange(option.value)
              close()
            }}
          >
            {option.label}
          </MenuOption>
        ))}
      </div>
    )}
  </Popover>
)

/** How to make an epic, with an example to copy and a way to start one in Forgejo. */
const NoEpics = ({ org, selected }: { org: string; selected: ReadonlyArray<string> }) => {
  const toast = useToast()
  const repos = useQuery({ queryKey: ["org-repos", org], queryFn: () => fetchOrgRepos(org) })
  // An archived repository takes no new issues.
  const repo = repos.data?.find(
    (candidate) => !candidate.archived && selected.includes(candidate.name),
  )?.name
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: fetchInstance,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const copy = () =>
    navigator.clipboard.writeText(CHILD_EXAMPLE).then(
      () => toast({ tone: "success", title: "Example copied" }),
      () => toast({ tone: "error", title: "Could not copy the example" }),
    )
  const newIssue =
    instance.data === undefined || repo === undefined
      ? undefined
      : `${instance.data.forgejoUrl}/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/issues/new?${new URLSearchParams({ body: CHILD_EXAMPLE })}`
  return (
    <section aria-labelledby="no-epics" className={`${cardClass} max-w-2xl p-4 sm:p-5`}>
      <div className="flex items-start gap-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Glyph name="epics" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="no-epics" className="text-sm font-semibold">
            No epics in these repositories yet
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            An epic is a Forgejo issue with the{" "}
            <code className="rounded bg-zinc-100 px-1 py-px font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              Type/Epic
            </code>{" "}
            label, or the label your <code className="font-mono text-xs">EPIC_LABEL</code> setting
            names. List its children in the body as a task list:
          </p>
          <div className="mt-3 flex items-start justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pr-1.5 pl-3 dark:border-zinc-800 dark:bg-zinc-950/50">
            <pre className="overflow-x-auto py-1 font-mono text-xs leading-5 text-zinc-700 dark:text-zinc-300">
              {CHILD_EXAMPLE}
            </pre>
            <button
              type="button"
              onClick={() => void copy()}
              aria-label="Copy the example"
              title="Copy"
              className={buttonClass.iconSmall}
            >
              <CopyIcon className="size-4" />
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Progress follows each child's state in Forgejo.
          </p>
          {newIssue !== undefined && (
            <a
              href={newIssue}
              target="_blank"
              rel="noreferrer"
              className={`${buttonClass.primary} mt-4`}
            >
              New epic in {repo}
              <span className="sr-only"> (opens in Forgejo)</span>
              <ExternalIcon className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

const Stat = ({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string
  value: ReactNode
  detail: string
  tone?: string
}) => (
  <div className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">
    <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className={`mt-1 text-2xl/7 font-semibold tracking-tight tabular-nums ${tone}`}>{value}</dd>
    <dd className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{detail}</dd>
  </div>
)

export const EpicsPage = ({ org }: { org: string }) => {
  const repoSelection = useRepoSelection(org)
  const [params, setParams] = useSearchParams()
  const filters = readEpicFilters(params)
  const openEpics = readOpenEpics(params)
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
  const setEpicOpen = (key: string, open: boolean) =>
    setParams((current) => withEpicOpen(current, key, open), { replace: true })
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
  const notice = epics.data === undefined ? "" : incompleteNotice(epics.data.incomplete)
  const noneLoaded = epics.data?.failedRepos.length === repoSelection.selected.length
  const partlyRead = (epics.data?.incomplete.listings.length ?? 0) > 0
  const avatars = new Map(
    all.flatMap((epic) => epic.assignees.map(({ login, avatarUrl }) => [login, avatarUrl])),
  )
  const assignees = [...new Set([filters.assignee, ...avatars.keys()])].filter(Boolean).sort()
  const sharedLabels = new Set(
    all.length < 2
      ? []
      : (all[0]?.labels ?? [])
          .filter((label) => all.every((epic) => epic.labels.some(({ id }) => id === label.id)))
          .map((label) => label.id),
  )
  const sort = SORTS.find(({ value }) => value === filters.sort) ?? SORTS[0]

  return (
    <main className="pb-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6">
        <ScopeBar org={org} view="epics" repoSelection={repoSelection} />
        <PageTitle title="Epics" meta="Large pieces of work, tracked through their child issues." />
        {epics.isError && hasSelection && (
          <ErrorNotice
            title={`Could not ${epics.data === undefined ? "load" : "refresh"} epics`}
            onRetry={() => void epics.refetch()}
            retrying={epics.isFetching}
            className="mb-4"
          >
            {epics.error.message}
          </ErrorNotice>
        )}
        {hasSelection && (epics.data?.failedRepos.length ?? 0) > 0 && (
          <ErrorNotice
            tone="warning"
            title="Could not load some repositories"
            onRetry={() => void epics.refetch()}
            retrying={epics.isFetching}
            className="mb-4"
          >
            {`${epics.data?.failedRepos.map(({ repo, message }) => `${repo} (${message})`).join(", ")}.`}
          </ErrorNotice>
        )}
        {hasSelection && notice !== "" && (
          <ErrorNotice tone="warning" title="Some epics may be missing" className="mb-4">
            {notice}
          </ErrorNotice>
        )}
        {repoSelection.resolving ? (
          <LoadingEpics />
        ) : !hasSelection ? (
          <ChooseRepos org={org} view="epics" repoSelection={repoSelection}>
            Pick the repositories whose epics you want to follow.
          </ChooseRepos>
        ) : epics.data === undefined ? (
          epics.isError ? null : (
            <LoadingEpics />
          )
        ) : (
          <>
            {all.length > 0 && (
              <>
                <dl
                  aria-label="Summary of the chosen repositories"
                  className={`${cardClass} grid grid-cols-3 divide-x divide-zinc-100 dark:divide-zinc-800`}
                >
                  <Stat
                    label="Epics"
                    value={all.length}
                    detail={`${summary.total} ${summary.total === 1 ? "child" : "children"}`}
                  />
                  <Stat
                    label="Completion"
                    value={
                      <>
                        {summary.percent}
                        <span className="ml-px text-base font-medium text-zinc-500 dark:text-zinc-400">
                          %
                        </span>
                      </>
                    }
                    detail={`${summary.done} of ${summary.total} done`}
                  />
                  <Stat
                    label="At risk"
                    value={summary.atRisk}
                    detail="Open, nothing done"
                    tone={summary.atRisk > 0 ? "text-amber-700 dark:text-amber-400" : ""}
                  />
                </dl>
                <search
                  aria-label="Filter epics"
                  className="mt-6 mb-4 flex flex-wrap items-center gap-2"
                >
                  <SearchField
                    label="Search epics"
                    placeholder="Search epics or #number"
                    value={filters.text}
                    onChange={(text) => set("q", text)}
                    className="w-full sm:w-64"
                  />
                  <Segmented
                    label="Epic state"
                    options={STATES}
                    value={filters.state}
                    onChange={(value) => set("state", value)}
                  />
                  {assignees.length > 0 && (
                    <ChoiceMenu
                      name="Assignee"
                      value={filters.assignee}
                      onChange={(value) => set("assignee", value)}
                      label={
                        filters.assignee === "" ? (
                          <span className="text-zinc-600 dark:text-zinc-400">Assignee</span>
                        ) : (
                          <>
                            <Avatar
                              url={avatars.get(filters.assignee) ?? ""}
                              name={filters.assignee}
                              size="xs"
                            />
                            <span className="truncate">{filters.assignee}</span>
                          </>
                        )
                      }
                      options={[
                        { value: "", label: "Anyone" },
                        ...assignees.map((login) => ({
                          value: login,
                          label: (
                            <>
                              <Avatar url={avatars.get(login) ?? ""} name={login} size="xs" />
                              <span className="truncate">{login}</span>
                            </>
                          ),
                        })),
                      ]}
                    />
                  )}
                  {filtered && (
                    <button type="button" onClick={clearFilters} className={buttonClass.ghost}>
                      <XIcon className="size-3.5" />
                      Clear
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <p
                      aria-live="polite"
                      className="text-xs text-zinc-500 tabular-nums max-sm:sr-only dark:text-zinc-400"
                    >
                      {filtered
                        ? `${shown.length} of ${all.length}`
                        : `${all.length} ${all.length === 1 ? "epic" : "epics"}`}
                      <span className="sr-only">{epics.isFetching ? ", refreshing" : ""}</span>
                    </p>
                    <ChoiceMenu
                      name="Sort by"
                      align="end"
                      value={filters.sort}
                      onChange={(value) => set("sort", value === "updated" ? "" : value)}
                      triggerClass={`${buttonClass.ghost} ${touchTarget}`}
                      label={
                        <>
                          <SortIcon className="size-4 text-zinc-500 dark:text-zinc-400" />
                          <span className="sr-only">Sort: </span>
                          <span className="max-sm:hidden">{sort.label}</span>
                          <span className="sm:hidden">{sort.short}</span>
                        </>
                      }
                      options={SORTS}
                    />
                  </div>
                </search>
              </>
            )}
            {shown.length > 0 ? (
              <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {shown.map((epic) => (
                  <EpicCard
                    key={epic.key}
                    org={org}
                    selected={repoSelection.selected}
                    epic={epic}
                    columns={epics.data.columns}
                    sharedLabels={sharedLabels}
                    expanded={openEpics.has(epic.key)}
                    onExpandedChange={(open) => setEpicOpen(epic.key, open)}
                  />
                ))}
              </div>
            ) : filtered ? (
              <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-10 text-sm text-zinc-600 dark:text-zinc-400">
                No epics match these filters.
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-md font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                >
                  Clear filters
                </button>
              </p>
            ) : noneLoaded ? (
              <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
                No epics could be loaded.
              </p>
            ) : partlyRead ? (
              <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
                No epics in the part of the issues Tabulo read.
              </p>
            ) : (
              <NoEpics org={org} selected={repoSelection.selected} />
            )}
          </>
        )}
      </div>
    </main>
  )
}
