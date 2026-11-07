import type { DashboardItem, NotificationItem } from "../shared/api.ts"
import { absoluteTime, relativeTime, textColorOn } from "./format.ts"

const linkClass =
  "block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"

const Updated = ({ iso }: { iso: string }) => (
  <time dateTime={iso} title={absoluteTime(iso)}>
    {relativeTime(iso)}
  </time>
)

const KindIcon = ({ kind }: { kind: DashboardItem["kind"] }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`mt-0.5 size-4 shrink-0 ${kind === "pull" ? "text-emerald-600" : "text-sky-600"}`}
  >
    {kind === "pull" ? (
      <>
        <circle cx="4" cy="3.5" r="1.75" />
        <circle cx="4" cy="12.5" r="1.75" />
        <circle cx="12" cy="12.5" r="1.75" />
        <path d="M4 5.25v5.5M12 10.75V6a2 2 0 0 0-2-2H7.5M9 2.5 7.5 4 9 5.5" />
      </>
    ) : (
      <>
        <circle cx="8" cy="8" r="6.25" />
        <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      </>
    )}
  </svg>
)

export const ItemRow = ({ item }: { item: DashboardItem }) => (
  <div className="flex gap-3 px-4 py-3">
    <KindIcon kind={item.kind} />
    <div className="min-w-0 flex-1">
      <a href={item.url} className={linkClass}>
        <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="sr-only">{item.kind === "pull" ? "Pull request " : "Issue "}</span>
          {item.repo}#{item.number}
        </span>
        <span className="block break-words text-sm font-medium text-zinc-900 hover:text-indigo-700 dark:text-zinc-100 dark:hover:text-indigo-300">
          {item.title}
        </span>
      </a>
      {item.labels.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Labels">
          {item.labels.map((label) => (
            <li
              key={label.name}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: label.color, color: textColorOn(label.color) }}
            >
              {label.name}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {item.author} · updated <Updated iso={item.updatedAt} />
        {item.comments > 0 && ` · ${item.comments} ${item.comments === 1 ? "comment" : "comments"}`}
      </p>
    </div>
  </div>
)

export const NotificationRow = ({ notification }: { notification: NotificationItem }) => {
  const label = (
    <>
      <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {notification.repo} · {notification.subjectType}
      </span>
      <span className="block break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {notification.title}
      </span>
    </>
  )
  return (
    <div className="px-4 py-3">
      {notification.url === "" ? (
        label
      ) : (
        <a href={notification.url} className={`${linkClass} hover:text-indigo-700`}>
          {label}
        </a>
      )}
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        <Updated iso={notification.updatedAt} />
      </p>
    </div>
  )
}
