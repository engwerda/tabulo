import type { ReactNode } from "react"
import type { DashboardItem, NotificationItem } from "../shared/api.ts"
import { absoluteTime, relativeTime } from "./format.ts"
import { AtIcon, BellIcon, CommentIcon, IssueOpenIcon, PullIcon, UserIcon } from "./ui/icons.tsx"
import { LabelList } from "./ui/LabelChip.tsx"

const Updated = ({ iso }: { iso: string }) => (
  <time dateTime={iso} title={absoluteTime(iso)}>
    {relativeTime(iso)}
  </time>
)

type Kind = DashboardItem["kind"] | "notification" | "assigned" | "mention"

const KIND_TONE: Record<Kind, string> = {
  pull: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  issue: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  assigned: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  mention: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  notification: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
}

const KIND_ICON: Record<Kind, ReactNode> = {
  pull: <PullIcon />,
  issue: <IssueOpenIcon />,
  assigned: <UserIcon />,
  mention: <AtIcon />,
  notification: <BellIcon />,
}

export const KindIcon = ({ kind }: { kind: Kind }) => (
  <span
    aria-hidden="true"
    className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${KIND_TONE[kind]}`}
  >
    {KIND_ICON[kind]}
  </span>
)

/** Forgejo's notification subject types, in words. */
const SUBJECT_NAMES: Partial<Record<string, string>> = {
  Pull: "Pull request",
  Issue: "Issue",
  Commit: "Commit",
  Repository: "Repository",
}

const rowClass =
  "group relative flex gap-3 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
const stretchedLink =
  "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-indigo-500"

export const ItemRow = ({ item }: { item: DashboardItem }) => (
  <div className={rowClass}>
    <KindIcon kind={item.kind} />
    <div className="min-w-0 flex-1">
      <a
        href={item.url}
        className={`block text-sm leading-5 font-medium break-words text-zinc-900 group-hover:text-indigo-700 dark:text-zinc-100 dark:group-hover:text-indigo-300 ${stretchedLink}`}
      >
        <span className="sr-only">{item.kind === "pull" ? "Pull request: " : "Issue: "}</span>
        {item.title}
      </a>
      <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          {item.repo} #{item.number}
        </span>{" "}
        · {item.author} · <Updated iso={item.updatedAt} />
      </p>
      <LabelList labels={item.labels} className="mt-2" />
    </div>
    {item.comments > 0 && (
      <span
        className="flex h-5 shrink-0 items-center gap-1 text-xs text-zinc-400 tabular-nums"
        title={`${item.comments} ${item.comments === 1 ? "comment" : "comments"}`}
      >
        <CommentIcon className="size-3.5" />
        {item.comments}
        <span className="sr-only">{item.comments === 1 ? " comment" : " comments"}</span>
      </span>
    )}
  </div>
)

export const NotificationRow = ({ notification }: { notification: NotificationItem }) => (
  <div className={rowClass}>
    <KindIcon kind="notification" />
    <div className="min-w-0 flex-1">
      {notification.url === "" ? (
        <p className="text-sm leading-5 font-medium break-words">{notification.title}</p>
      ) : (
        <a
          href={notification.url}
          className={`block text-sm leading-5 font-medium break-words text-zinc-900 group-hover:text-indigo-700 dark:text-zinc-100 dark:group-hover:text-indigo-300 ${stretchedLink}`}
        >
          {notification.title}
        </a>
      )}
      <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">{notification.repo}</span> ·{" "}
        {SUBJECT_NAMES[notification.subjectType] ?? notification.subjectType} ·{" "}
        <Updated iso={notification.updatedAt} />
      </p>
    </div>
  </div>
)
