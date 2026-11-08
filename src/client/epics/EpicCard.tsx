import { useId, useState } from "react"
import type { BoardColumn, Epic, EpicChild } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { absoluteTime, relativeTime } from "../format.ts"
import { LabelList } from "../ui/LabelChip.tsx"
import { completion } from "./epics-view.ts"

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"

const columnColor = (column: BoardColumn, columns: ReadonlyArray<BoardColumn>) =>
  column._tag === "Todo"
    ? "var(--chart-axis)"
    : column._tag === "Done"
      ? "var(--chart-positive)"
      : `var(--chart-${(columns.filter((item) => item._tag === "Status").findIndex((item) => item.key === column.key) % 6) + 1})`

const Assignees = ({ people }: { people: Epic["assignees"] }) =>
  people.length === 0 ? null : (
    <ul className="flex flex-wrap gap-1" aria-label="Assignees">
      {people.map(({ login, avatarUrl }) => (
        <li key={login} title={login}>
          <span className="sr-only">{login}</span>
          <Avatar key={avatarUrl} url={avatarUrl} name={login} size="sm" />
        </li>
      ))}
    </ul>
  )

const ColumnChip = ({
  column,
  columns,
}: {
  column: string
  columns: ReadonlyArray<BoardColumn>
}) => {
  const details = columns.find(({ key }) => key === column)
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor:
            details === undefined ? "var(--chart-axis)" : columnColor(details, columns),
        }}
      />
      <span className="truncate">{details?.title ?? column}</span>
    </span>
  )
}

const ChildRow = ({ child, columns }: { child: EpicChild; columns: ReadonlyArray<BoardColumn> }) =>
  child._tag === "Unavailable" ? (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="break-all font-mono">{child.ref}</span>
      <span>Unavailable</span>
    </li>
  ) : (
    <li className="flex items-start gap-3 px-5 py-3">
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
      >
        {child.kind === "issue" ? (
          <>
            <circle cx="8" cy="8" r="5.5" />
            <path d={child.state === "closed" ? "m5 8 2 2 4-4" : "M8 6v4"} />
          </>
        ) : (
          <>
            <circle cx="4" cy="3" r="1.5" />
            <circle cx="4" cy="13" r="1.5" />
            <circle cx="12" cy="13" r="1.5" />
            <path d="M4 4.5v7M12 11.5V7a4 4 0 0 0-4-4M8 1l-2 2 2 2" />
          </>
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <a href={child.url} className={`block rounded-sm ${focus}`}>
          <span className="block break-all font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="sr-only">{child.kind === "pull" ? "Pull request" : "Issue"} </span>
            {child.repo}#{child.number}
          </span>
          <span className="mt-0.5 block wrap-anywhere text-sm font-medium hover:text-indigo-700 dark:hover:text-indigo-300">
            {child.title}
          </span>
        </a>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <ColumnChip column={child.column} columns={columns} />
          <Assignees people={child.assignees} />
        </div>
      </div>
    </li>
  )

export const EpicCard = ({
  epic,
  columns,
}: {
  epic: Epic
  columns: ReadonlyArray<BoardColumn>
}) => {
  const [expanded, setExpanded] = useState(false)
  const childrenId = useId()
  const headingId = useId()
  const unavailable = epic.children.filter((child) => child._tag === "Unavailable").length
  const segments = columns.map((column) => ({
    key: column.key,
    title: column.title,
    count: epic.progress.byColumn[column.key] ?? 0,
    color: columnColor(column, columns),
  }))
  if (unavailable > 0)
    segments.push({
      key: "unavailable",
      title: "Unavailable",
      count: unavailable,
      color: "var(--chart-grid)",
    })
  const percent = completion(epic.progress)
  return (
    <article
      aria-labelledby={headingId}
      className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {epic.repo}#{epic.number}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${epic.state === "open" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
          >
            {epic.state === "open" ? "Open" : "Closed"}
          </span>
        </div>
        <h3 id={headingId} className="mt-3 text-lg/6 font-semibold tracking-tight">
          <a
            href={epic.url}
            className={`rounded-sm wrap-anywhere hover:text-indigo-700 dark:hover:text-indigo-300 ${focus}`}
          >
            {epic.title}
          </a>
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ColumnChip column={epic.column} columns={columns} />
          {epic.milestone !== null && (
            <span className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
              Milestone · {epic.milestone}
            </span>
          )}
        </div>
        <LabelList labels={epic.labels} className="mt-1.5" />
        <div className="mt-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium tabular-nums">
              {epic.progress.done}{" "}
              <span className="font-normal text-zinc-500 dark:text-zinc-400">of</span>{" "}
              {epic.progress.total}{" "}
              <span className="font-normal text-zinc-500 dark:text-zinc-400">done</span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {epic.progress.total === 0
                ? "Add a task list to start tracking"
                : "From the current Forgejo state"}
            </p>
          </div>
          <span className="shrink-0 text-3xl font-semibold tracking-tight tabular-nums">
            {percent}
            <span className="ml-0.5 text-base font-normal text-zinc-400">%</span>
            <span className="sr-only"> complete</span>
          </span>
        </div>
        <div
          role="img"
          aria-label={
            segments
              .filter(({ count }) => count > 0)
              .map(({ title, count }) => `${title}: ${count}`)
              .join(", ") || "No children"
          }
          className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        >
          {segments
            .filter(({ count }) => count > 0)
            .map(({ key, count, color }) => (
              <span
                key={key}
                className="min-w-0"
                style={{ width: `${(count / epic.progress.total) * 100}%`, backgroundColor: color }}
              />
            ))}
        </div>
        <ul
          aria-label="Progress by column"
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400"
        >
          {segments
            .filter(({ count }) => count > 0)
            .map(({ key, title, count, color }) => (
              <li key={key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {title}
                <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                  {count}
                </span>
              </li>
            ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Assignees people={epic.assignees} />
          <time
            dateTime={epic.updatedAt}
            title={absoluteTime(epic.updatedAt)}
            className="text-[11px] text-zinc-500 dark:text-zinc-400"
          >
            Updated {relativeTime(epic.updatedAt)}
          </time>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={childrenId}
        onClick={() => setExpanded((value) => !value)}
        className={`flex w-full items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/70 px-5 py-3 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300 dark:hover:bg-zinc-800`}
      >
        <span>
          {expanded ? "Hide" : "Show"} {epic.progress.total} children
          <span className="sr-only"> of {epic.title}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`size-4 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <div
        id={childrenId}
        hidden={!expanded}
        className="border-t border-zinc-100 dark:border-zinc-800"
      >
        {epic.children.length === 0 ? (
          <p className="px-5 py-4 text-xs text-zinc-500 dark:text-zinc-400">
            Reference issues in the epic body, for example <code>- [ ] #12</code>.
          </p>
        ) : (
          <ul
            aria-label={`Children of ${epic.title}`}
            className="divide-y divide-zinc-100 dark:divide-zinc-800"
          >
            {epic.children.map((child) => (
              <ChildRow
                key={child._tag === "Issue" ? child.key : child.ref}
                child={child}
                columns={columns}
              />
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
