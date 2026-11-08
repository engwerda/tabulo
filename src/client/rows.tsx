import type { ReactNode } from "react"
import type { DashboardItem, NotificationItem } from "../shared/api.ts"
import { absoluteTime, relativeTime } from "./format.ts"
import { IssueRef } from "./ui/IssueRef.tsx"
import { BellIcon, CommentIcon, IssueOpenIcon, PullIcon } from "./ui/icons.tsx"
import { LabelList } from "./ui/LabelChip.tsx"

const Updated = ({ iso }: { iso: string }) => (
  <time dateTime={iso} title={absoluteTime(iso)}>
    {relativeTime(iso)}
  </time>
)

/** Forgejo's notification subject types, in words. */
const SUBJECT_NAMES: Partial<Record<string, string>> = {
  Pull: "Pull request",
  Issue: "Issue",
  Commit: "Commit",
  Repository: "Repository",
}

const SUBJECT_ICONS: Partial<Record<string, ReactNode>> = {
  Pull: <PullIcon />,
  Issue: <IssueOpenIcon />,
}

const SHOWN_LABELS = 2

const rowClass =
  "group relative flex gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
const stretchedLink =
  "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-indigo-500"
const titleClass = "text-sm leading-5 font-medium break-words text-zinc-900 dark:text-zinc-100"
const glyphClass =
  "mt-0.5 flex shrink-0 text-zinc-400 group-hover:text-zinc-500 dark:text-zinc-500 dark:group-hover:text-zinc-400"
const metaClass = "text-xs leading-5 text-zinc-500 dark:text-zinc-400"
const refClass = "font-medium text-zinc-600 tabular-nums dark:text-zinc-300"

const Comments = ({ count }: { count: number }) =>
  count === 0 ? null : (
    <span
      className="flex h-5 shrink-0 items-center gap-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
      title={`${count} ${count === 1 ? "comment" : "comments"}`}
    >
      <CommentIcon className="size-3.5" />
      {count}
      <span className="sr-only">{count === 1 ? " comment" : " comments"}</span>
    </span>
  )

/** The first labels as chips, then a count of the rest that names them on hover. */
const Labels = ({ labels }: { labels: DashboardItem["labels"] }) => {
  if (labels.length === 0) return null
  const rest = labels.slice(SHOWN_LABELS)
  return (
    <span className="flex min-w-0 items-center gap-1">
      <LabelList labels={labels.slice(0, SHOWN_LABELS)} compact className="min-w-0" />
      {rest.length > 0 && (
        <span
          title={rest.map((label) => label.name).join(", ")}
          className="relative z-10 shrink-0 rounded-md px-1 text-2xs font-medium text-zinc-500 tabular-nums dark:text-zinc-400"
        >
          <span aria-hidden="true">+{rest.length}</span>
          <span className="sr-only">
            {`, ${rest.length} more ${rest.length === 1 ? "label" : "labels"}: ${rest
              .map((label) => label.name)
              .join(", ")}`}
          </span>
        </span>
      )}
    </span>
  )
}

/**
 * An open issue or pull request. `alsoIn` names the section higher on the page that already shows
 * it in full; the row then keeps only its title and reference, so a repeated item takes one
 * quiet row instead of a second copy of its labels and authorship.
 */
export const ItemRow = ({ item, alsoIn }: { item: DashboardItem; alsoIn?: string | undefined }) => (
  <div className={rowClass}>
    <span className={glyphClass}>{item.kind === "pull" ? <PullIcon /> : <IssueOpenIcon />}</span>
    <div className="min-w-0 flex-1">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className={`block ${titleClass} ${stretchedLink}`}
      >
        <span className="sr-only">{item.kind === "pull" ? "Pull request: " : "Issue: "}</span>
        {item.title}
        <span className="sr-only"> (opens in Forgejo)</span>
      </a>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-5">
        <p className={`min-w-0 truncate ${metaClass}`}>
          <IssueRef repo={item.repo} number={item.number} className={refClass} />
          {alsoIn === undefined ? (
            <>
              {" "}
              · {item.author} · <Updated iso={item.updatedAt} />
            </>
          ) : (
            <> · Also in {alsoIn}</>
          )}
        </p>
        {alsoIn === undefined && <Labels labels={item.labels} />}
      </div>
    </div>
    <Comments count={item.comments} />
  </div>
)

/** A notification names no number, but an issue's or pull request's address ends in one. */
const numberIn = (url: string) => {
  const match = /\/(?:issues|pulls)\/(\d+)(?:[/?#]|$)/.exec(url)
  return match?.[1] === undefined ? null : Number(match[1])
}

export const NotificationRow = ({ notification }: { notification: NotificationItem }) => {
  const number = numberIn(notification.url)
  return (
    <div className={rowClass}>
      <span className={glyphClass}>{SUBJECT_ICONS[notification.subjectType] ?? <BellIcon />}</span>
      <div className="min-w-0 flex-1">
        {notification.url === "" ? (
          <p className={titleClass}>{notification.title}</p>
        ) : (
          <a
            href={notification.url}
            target="_blank"
            rel="noreferrer"
            className={`block ${titleClass} ${stretchedLink}`}
          >
            {notification.title}
            <span className="sr-only"> (opens in Forgejo)</span>
          </a>
        )}
        <p className={`truncate ${metaClass}`}>
          {number === null ? (
            <span className={refClass}>{notification.repo}</span>
          ) : (
            <IssueRef repo={notification.repo} number={number} className={refClass} />
          )}{" "}
          · {SUBJECT_NAMES[notification.subjectType] ?? notification.subjectType} ·{" "}
          <Updated iso={notification.updatedAt} />
        </p>
      </div>
    </div>
  )
}
