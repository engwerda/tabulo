import { useQuery } from "@tanstack/react-query"
import type { Dashboard, DashboardItem, NotificationItem } from "../shared/api.ts"
import { fetchDashboard } from "./api.ts"
import { ItemRow, NotificationRow } from "./rows.tsx"
import { SectionCard } from "./SectionCard.tsx"

export const DASHBOARD = ["dashboard"] as const

const ITEM_SECTIONS = [
  {
    key: "reviewRequests",
    title: "Review requests",
    empty: "No pull requests are waiting for your review.",
  },
  { key: "assigned", title: "Assigned to me", empty: "Nothing open is assigned to you." },
  { key: "mentioned", title: "Mentions", empty: "No open issues or pull requests mention you." },
  { key: "created", title: "Created by me", empty: "You have no open issues or pull requests." },
] as const satisfies ReadonlyArray<{ key: keyof Dashboard; title: string; empty: string }>

const SkeletonGrid = () => (
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
    {Array.from({ length: 5 }, (_, index) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        key={index}
        className="h-48 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      />
    ))}
  </div>
)

export const DashboardView = () => {
  const dashboard = useQuery({
    queryKey: DASHBOARD,
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const retry = () => void dashboard.refetch()

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="sr-only">My dashboard</h1>
      <p className="sr-only" aria-live="polite">
        {dashboard.isFetching ? "Refreshing dashboard" : ""}
      </p>
      {dashboard.data === undefined ? (
        dashboard.isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            <p>Could not load the dashboard: {dashboard.error.message}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-red-800 dark:hover:bg-red-900"
            >
              Retry
            </button>
          </div>
        ) : (
          <SkeletonGrid />
        )
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ITEM_SECTIONS.map(({ key, title, empty }) => (
            <SectionCard<DashboardItem>
              key={key}
              title={title}
              empty={empty}
              section={dashboard.data[key]}
              itemKey={(item) => `${item.repo}#${item.number}`}
              renderItem={(item) => <ItemRow item={item} />}
              onRetry={retry}
              retrying={dashboard.isFetching}
            />
          ))}
          <SectionCard<NotificationItem>
            title="Unread notifications"
            empty="You are all caught up."
            section={dashboard.data.notifications}
            itemKey={(notification) => notification.id}
            renderItem={(notification) => <NotificationRow notification={notification} />}
            onRetry={retry}
            retrying={dashboard.isFetching}
          />
        </div>
      )}
    </main>
  )
}
