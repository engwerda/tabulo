import { useId, useState } from "react"
import type { BoardColumn, Epic, EpicChild } from "../../shared/api.ts"
import { AvatarStack } from "../Avatar.tsx"
import { absoluteTime, relativeTime } from "../format.ts"
import { IssueRef } from "../ui/IssueRef.tsx"
import {
  ChevronDownIcon,
  IssueClosedIcon,
  IssueOpenIcon,
  MilestoneIcon,
  PullIcon,
} from "../ui/icons.tsx"
import { LabelChip } from "../ui/LabelChip.tsx"
import { cardClass } from "../ui/primitives.tsx"
import { completion } from "./epics-view.ts"

const chipClass =
  "inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-1.5 py-px text-2xs font-medium text-zinc-700 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-300"

/** The board's own colors: a status column takes its Forgejo label's color, as its dot does. */
const columnColor = (column: BoardColumn) =>
  column._tag === "Todo"
    ? "var(--chart-axis)"
    : column._tag === "Done"
      ? "var(--chart-positive)"
      : column.label.color

const ColumnChip = ({
  column,
  columns,
}: {
  column: string
  columns: ReadonlyArray<BoardColumn>
}) => {
  const details = columns.find(({ key }) => key === column)
  return (
    <span className={chipClass}>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{
          backgroundColor: details === undefined ? "var(--chart-axis)" : columnColor(details),
        }}
      />
      <span className="truncate">{details?.title ?? column}</span>
    </span>
  )
}

/** Open is neutral; a closed epic counts as done, in the Done column's green. */
const StateChip = ({ state }: { state: Epic["state"] }) => (
  <span className={`${chipClass} shrink-0`}>
    <span
      aria-hidden="true"
      className={`size-2 rounded-full ${
        state === "open"
          ? "border-[1.5px] border-zinc-500 dark:border-zinc-400"
          : "bg-chart-positive"
      }`}
    />
    {state === "open" ? "Open" : "Closed"}
  </span>
)

/** Closed children are done, in the same green as the Done column. */
const ChildIcon = ({ child }: { child: Extract<EpicChild, { _tag: "Issue" }> }) => {
  const tone = child.state === "closed" ? "text-chart-positive" : "text-zinc-500 dark:text-zinc-400"
  const className = `mt-0.5 size-4 ${tone}`
  if (child.kind === "pull") return <PullIcon className={className} />
  return child.state === "closed" ? (
    <IssueClosedIcon className={className} />
  ) : (
    <IssueOpenIcon className={className} />
  )
}

/** A child in the page's organization shows its bare repository name, as the epic does. */
const shortRepo = (org: string, repo: string) =>
  repo.toLowerCase().startsWith(`${org.toLowerCase()}/`) ? repo.slice(org.length + 1) : repo

const ChildRow = ({
  org,
  child,
  columns,
}: {
  org: string
  child: EpicChild
  columns: ReadonlyArray<BoardColumn>
}) =>
  child._tag === "Unavailable" ? (
    <li className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
      <span
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] border-dashed border-zinc-300 dark:border-zinc-600"
      />
      <span className="min-w-0 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="text-xs break-all tabular-nums">{child.ref}</span>
        <span className="block text-xs">Not available to you, or not found in Forgejo</span>
      </span>
    </li>
  ) : (
    <li className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
      <ChildIcon child={child} />
      <div className="min-w-0 flex-1">
        <a
          href={child.url}
          className="block rounded-sm text-sm font-medium wrap-anywhere text-zinc-900 hover:text-indigo-700 dark:text-zinc-100 dark:hover:text-indigo-300"
        >
          <span className="sr-only">
            {child.kind === "pull" ? "Pull request" : "Issue"}, {child.state},{" "}
          </span>
          {child.title}
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <IssueRef
            repo={shortRepo(org, child.repo)}
            number={child.number}
            className="text-xs text-zinc-500 dark:text-zinc-400"
          />
          <ColumnChip column={child.column} columns={columns} />
        </div>
      </div>
      {child.assignees.length > 0 && <AvatarStack people={child.assignees} size="xs" />}
    </li>
  )

export const EpicCard = ({
  org,
  epic,
  columns,
  sharedLabels,
}: {
  org: string
  epic: Epic
  columns: ReadonlyArray<BoardColumn>
  /** Labels every epic on the page carries, such as the epic label itself: not worth repeating. */
  sharedLabels: ReadonlySet<number>
}) => {
  const [expanded, setExpanded] = useState(false)
  const childrenId = useId()
  const headingId = useId()
  const unavailable = epic.children.filter((child) => child._tag === "Unavailable").length
  // Done first, then each column by how close it is to done, so the bar fills from the left.
  const byProgress = [
    ...columns.filter((column) => column._tag === "Done"),
    ...columns.filter((column) => column._tag !== "Done").reverse(),
  ]
  const segments = byProgress.map((column) => ({
    key: column.key,
    title: column.title,
    count: epic.progress.byColumn[column.key] ?? 0,
    color: columnColor(column),
  }))
  if (unavailable > 0)
    segments.push({
      key: "unavailable",
      title: "Unavailable",
      count: unavailable,
      color: "var(--chart-grid)",
    })
  const filled = segments.filter(({ count }) => count > 0)
  const percent = completion(epic.progress)
  const count = epic.children.length
  return (
    <article aria-labelledby={headingId} className={`${cardClass} min-w-0 overflow-hidden`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <IssueRef
            repo={epic.repo}
            number={epic.number}
            className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400"
          />
          <StateChip state={epic.state} />
        </div>
        <h3 id={headingId} className="mt-2 text-base/6 font-semibold tracking-tight">
          <a
            href={epic.url}
            className="rounded-sm wrap-anywhere hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            {epic.title}
          </a>
        </h3>
        <ul aria-label="Column and labels" className="mt-2.5 flex flex-wrap items-center gap-1">
          <li className="min-w-0 max-w-full">
            <ColumnChip column={epic.column} columns={columns} />
          </li>
          {epic.labels
            .filter((label) => !sharedLabels.has(label.id))
            .map((label) => (
              <li key={label.id} className="min-w-0 max-w-full">
                <LabelChip name={label.name} color={label.color} compact />
              </li>
            ))}
        </ul>

        {epic.progress.total === 0 ? (
          <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
            No children yet. List them in the epic's body, like{" "}
            <code className="font-mono text-xs text-zinc-700 dark:text-zinc-300">- [ ] #12</code>.
          </p>
        ) : (
          <>
            <div className="mt-5 flex items-baseline justify-between gap-3">
              <p className="text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {epic.progress.done}
                </span>{" "}
                of {epic.progress.total} done
              </p>
              <p className="text-2xl/none font-semibold tracking-tight tabular-nums">
                {percent}
                <span className="ml-px text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  %
                </span>
                <span className="sr-only"> complete</span>
              </p>
            </div>
            <div
              role="img"
              aria-label={filled.map(({ title, count }) => `${title}: ${count}`).join(", ")}
              className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            >
              {filled.map(({ key, count, color }) => (
                <span
                  key={key}
                  className="min-w-0 first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(count / epic.progress.total) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              ))}
            </div>
            <ul
              aria-hidden="true"
              className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
            >
              {filled.map(({ key, title, count, color }) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {title}
                  <span className="font-medium text-zinc-800 tabular-nums dark:text-zinc-200">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-4 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {epic.assignees.length > 0 && <AvatarStack people={epic.assignees} size="sm" />}
          {epic.milestone !== null && (
            <span className="flex min-w-0 items-center gap-1">
              <MilestoneIcon className="size-3.5" />
              <span className="sr-only">Milestone</span>
              <span className="truncate">{epic.milestone}</span>
            </span>
          )}
          <time dateTime={epic.updatedAt} title={absoluteTime(epic.updatedAt)} className="ml-auto">
            Updated {relativeTime(epic.updatedAt)}
          </time>
        </div>
      </div>
      {count > 0 && (
        <>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={childrenId}
            onClick={() => setExpanded((value) => !value)}
            className="flex h-10 w-full items-center justify-between gap-2 border-t pointer-coarse:h-11 border-zinc-100 px-4 text-left text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 focus-visible:-outline-offset-2 sm:px-5 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
          >
            <span>
              {expanded ? "Hide" : "Show"} {count} {count === 1 ? "child" : "children"}
              <span className="sr-only"> of {epic.title}</span>
            </span>
            <ChevronDownIcon
              className={`size-4 text-zinc-500 transition-transform dark:text-zinc-400 ${expanded ? "rotate-180" : ""}`}
            />
          </button>
          <ul
            id={childrenId}
            hidden={!expanded}
            aria-label={`Children of ${epic.title}`}
            className="divide-y divide-zinc-100 border-t border-zinc-100 bg-zinc-50/50 dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/20"
          >
            {epic.children.map((child) => (
              <ChildRow
                org={org}
                key={child._tag === "Issue" ? child.key : child.ref}
                child={child}
                columns={columns}
              />
            ))}
          </ul>
        </>
      )}
    </article>
  )
}
