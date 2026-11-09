import { type ReactNode, useId } from "react"
import { Link } from "wouter"
import type { BoardColumn, Epic, EpicChild } from "../../shared/api.ts"
import { AvatarStack } from "../Avatar.tsx"
import { absoluteTime, relativeTime } from "../format.ts"
import { IssueRef } from "../ui/IssueRef.tsx"
import {
  ChevronDownIcon,
  ExternalIcon,
  IssueClosedIcon,
  IssueOpenIcon,
  MilestoneIcon,
  PullIcon,
} from "../ui/icons.tsx"
import { LabelChip } from "../ui/LabelChip.tsx"
import { buttonClass, cardClass } from "../ui/primitives.tsx"
import { boardCardHref, completion, type LinkedBoard, shortRepo } from "./epics-view.ts"

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

/** How a bar segment or a legend dot is drawn: with classes, or with a color the data gives. */
type Paint = { readonly className?: string; readonly color?: string }

const UNAVAILABLE_BAR =
  "bg-[repeating-linear-gradient(-45deg,var(--color-zinc-300)_0_1px,transparent_1px_4px)] dark:bg-[repeating-linear-gradient(-45deg,var(--color-zinc-600)_0_1px,transparent_1px_4px)]"

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

/**
 * An issue's link: to its card in the board's side panel when the board shows it, else to
 * Forgejo in a new tab. `board` is that board address.
 */
const IssueLink = ({
  board,
  url,
  className,
  children,
}: {
  board: string | null
  url: string
  className: string
  children: ReactNode
}) =>
  board === null ? (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      {children}
      <span className="sr-only"> (opens in Forgejo)</span>
    </a>
  ) : (
    <Link href={board} className={className}>
      {children}
    </Link>
  )

/**
 * Forgejo's page of an issue whose title opens its board card. It shows on hover or focus of
 * its row, where a pointer can hover, so that only the always-shown `ForgejoMark` reads as
 * "this row opens Forgejo".
 */
const ForgejoLink = ({
  url,
  name,
  className,
}: {
  url: string
  name: string
  className: string
}) => (
  <a
    href={url}
    target="_blank"
    rel="noreferrer"
    aria-label={`Open ${name} in Forgejo`}
    title="Open in Forgejo"
    className={`${buttonClass.iconSmall} z-10 shrink-0 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 ${className}`}
  >
    <ExternalIcon className="size-3.5" />
  </a>
)

/** Marks a row whose own link opens Forgejo, in the slot where other rows keep `ForgejoLink`. */
const ForgejoMark = ({ className }: { className: string }) => (
  <span
    aria-hidden="true"
    className={`inline-flex size-7 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400 ${className}`}
  >
    <ExternalIcon className="size-3.5" />
  </span>
)

const ChildRow = ({
  org,
  board,
  child,
  columns,
}: {
  org: string
  board: LinkedBoard | undefined
  child: EpicChild
  columns: ReadonlyArray<BoardColumn>
}) => {
  if (child._tag === "Unavailable") {
    return (
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
    )
  }
  const repo = shortRepo(org, child.repo)
  const cardHref = boardCardHref(org, board, child)
  return (
    // The title's link stretches over the row, so the whole row is one target.
    <li className="group/row relative flex items-start gap-3 px-4 py-2.5 transition hover:bg-zinc-100/60 sm:px-5 dark:hover:bg-zinc-800/40">
      <ChildIcon child={child} />
      <div className="min-w-0 flex-1">
        <IssueLink
          board={cardHref}
          url={child.url}
          className="block rounded-sm text-sm font-medium wrap-anywhere text-zinc-900 before:absolute before:inset-0 hover:text-indigo-700 dark:text-zinc-100 dark:hover:text-indigo-300"
        >
          <span className="sr-only">
            {child.kind === "pull" ? "Pull request" : "Issue"}, {child.state},{" "}
          </span>
          {child.title}
        </IssueLink>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <IssueRef
            repo={repo}
            number={child.number}
            className="text-xs text-zinc-500 dark:text-zinc-400"
          />
          <ColumnChip column={child.column} columns={columns} />
        </div>
      </div>
      {child.assignees.length > 0 && <AvatarStack people={child.assignees} size="xs" />}
      {cardHref === null ? (
        <ForgejoMark className="-my-1" />
      ) : (
        <ForgejoLink url={child.url} name={`${repo}#${child.number}`} className="-my-1" />
      )}
    </li>
  )
}

export const EpicCard = ({
  org,
  board,
  epic,
  columns,
  sharedLabels,
  expanded,
  onExpandedChange,
}: {
  org: string
  board: LinkedBoard | undefined
  epic: Epic
  columns: ReadonlyArray<BoardColumn>
  /** Labels every epic on the page carries, such as the epic label itself: not worth repeating. */
  sharedLabels: ReadonlySet<number>
  /** Whether the children show; the page keeps it, so Back brings it back. */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) => {
  const childrenId = useId()
  const headingId = useId()
  const unavailable = epic.children.filter((child) => child._tag === "Unavailable").length
  // Done first, then each column by how close it is to done, so the bar fills from the left.
  const byProgress = [
    ...columns.filter((column) => column._tag === "Done"),
    ...columns.filter((column) => column._tag !== "Done").reverse(),
  ]
  // Only progress has ink: Todo is the bar's empty track, and Unavailable is hatched.
  const segments: Array<{
    key: string
    title: string
    count: number
    bar: Paint
    dot: Paint
  }> = byProgress.map((column) => ({
    key: column.key,
    title: column.title,
    count: epic.progress.byColumn[column.key] ?? 0,
    bar:
      column._tag === "Todo"
        ? { className: "bg-zinc-200 dark:bg-zinc-800" }
        : { color: columnColor(column) },
    dot: { color: columnColor(column) },
  }))
  if (unavailable > 0)
    segments.push({
      key: "unavailable",
      title: "Unavailable",
      count: unavailable,
      bar: { className: UNAVAILABLE_BAR },
      dot: { className: "border border-dashed border-zinc-400 dark:border-zinc-500" },
    })
  const filled = segments.filter(({ count }) => count > 0)
  const percent = completion(epic.progress)
  const count = epic.children.length
  const epicBoard = boardCardHref(org, board, epic)
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
        <div className="group/row mt-2 flex items-start gap-2">
          <h3 id={headingId} className="min-w-0 flex-1 text-base/6 font-semibold tracking-tight">
            {/* On touch the link reaches into the space above and below it, to 44px. */}
            <IssueLink
              board={epicBoard}
              url={epic.url}
              className="relative block rounded-sm wrap-anywhere hover:text-indigo-700 pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2.5 dark:hover:text-indigo-300"
            >
              {epic.title}
            </IssueLink>
          </h3>
          {epicBoard === null ? (
            <ForgejoMark className="-my-0.5" />
          ) : (
            <ForgejoLink url={epic.url} name={`${epic.repo}#${epic.number}`} className="-my-0.5" />
          )}
        </div>
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
              className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full"
            >
              {filled.map(({ key, count, bar }) => (
                <span
                  key={key}
                  className={`min-w-0 first:rounded-l-full last:rounded-r-full ${bar.className ?? ""}`}
                  style={{
                    width: `${(count / epic.progress.total) * 100}%`,
                    backgroundColor: bar.color,
                  }}
                />
              ))}
            </div>
            <ul
              aria-hidden="true"
              className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400"
            >
              {filled.map(({ key, title, count, dot }) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${dot.className ?? ""}`}
                    style={{ backgroundColor: dot.color }}
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
            onClick={() => onExpandedChange(!expanded)}
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
                board={board}
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
