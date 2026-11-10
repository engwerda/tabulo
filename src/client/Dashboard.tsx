import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import type { Dashboard, DashboardItem, NotificationItem, Section } from "../shared/api.ts"
import { ACTIVITY, ActivityCard } from "./ActivityCard.tsx"
import { fetchDashboard } from "./api.ts"
import { ITEM_SECTIONS, type ItemSection, itemRef } from "./dashboard-preview.ts"
import { relativeTime } from "./format.ts"
import { ItemRow, NotificationRow } from "./rows.tsx"
import { SectionCard } from "./SectionCard.tsx"
import { useViewer } from "./session.ts"
import { ErrorNotice } from "./ui/ErrorNotice.tsx"
import { AtIcon, BellIcon, IssueOpenIcon, PullIcon, RefreshIcon, UserIcon } from "./ui/icons.tsx"
import { buttonClass, cardClass, pageContainer } from "./ui/primitives.tsx"

export const DASHBOARD = ["dashboard"] as const

type SectionKey = ItemSection | "notifications"

type SectionMeta = {
  readonly id: string
  readonly title: string
  readonly icon: ReactNode
  readonly empty: string
}

const SECTIONS: Record<SectionKey, SectionMeta> = {
  reviewRequests: {
    id: "review-requests",
    title: "Review requests",
    icon: <PullIcon />,
    empty: "None waiting",
  },
  assigned: {
    id: "assigned",
    title: "Assigned to me",
    icon: <UserIcon />,
    empty: "Nothing assigned",
  },
  notifications: {
    id: "notifications",
    title: "Unread notifications",
    icon: <BellIcon />,
    empty: "All caught up",
  },
  mentioned: {
    id: "mentioned",
    title: "Mentions",
    icon: <AtIcon />,
    empty: "No open mentions",
  },
  created: {
    id: "created",
    title: "Created by me",
    icon: <IssueOpenIcon />,
    empty: "None open",
  },
}

/**
 * The page's priority order: what waits on the user first. On wide screens the first two form
 * the left column and the rest the right, so a phone's single column reads in the same order.
 */
const COLUMNS: ReadonlyArray<ReadonlyArray<SectionKey>> = [
  ["reviewRequests", "assigned"],
  ["notifications", "mentioned", "created"],
]
/** A section's name in "Also in …" on an item that a section above it shows in full. */
const SHORT_TITLES: Record<ItemSection, string> = {
  reviewRequests: "Review requests",
  assigned: "Assigned",
  mentioned: "Mentions",
  created: "Created by me",
}
/** The header summary's parts, with the words for a count of one and of more. */
const SUMMARY: ReadonlyArray<readonly [SectionKey, string, string]> = [
  ["reviewRequests", "review waiting", "reviews waiting"],
  ["assigned", "assigned", "assigned"],
  ["notifications", "unread", "unread"],
  ["mentioned", "mention", "mentions"],
]

/** For each item, the first section in page order that lists it: the one that shows it in full. */
const homeSections = (data: Dashboard) => {
  const homes = new Map<string, ItemSection>()
  for (const key of ITEM_SECTIONS) {
    const section = data[key]
    if (section._tag !== "Loaded") continue
    for (const item of section.items) {
      if (!homes.has(itemRef(item))) homes.set(itemRef(item), key)
    }
  }
  return homes
}

const greeting = (hour: number) =>
  hour < 5
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening"

const total = (section: Section<unknown>) => (section._tag === "Loaded" ? section.total : 0)

/** The counts that wait on the user, such as "4 reviews waiting", each a link to its section. */
const Summary = ({ data }: { data: Dashboard }) => {
  const parts = SUMMARY.filter(([key]) => total(data[key]) > 0)
  if (parts.length === 0) {
    const anyFailed = SUMMARY.some(([key]) => data[key]._tag === "Failed")
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {anyFailed ? "Some sections could not load." : "Nothing is waiting on you."}
      </p>
    )
  }
  return (
    <nav aria-label="Summary">
      <ul className="-mx-0.5 flex flex-wrap items-center gap-x-3 text-sm text-zinc-500 dark:text-zinc-400">
        {parts.map(([key, one, many]) => {
          const count = total(data[key])
          return (
            <li key={key}>
              <a
                href={`#${SECTIONS[key].id}`}
                className="inline-block rounded-md px-0.5 underline-offset-4 transition-colors pointer-coarse:py-3 hover:text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:text-zinc-100"
              >
                <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                  {count}
                </span>{" "}
                {count === 1 ? one : many}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const SectionSkeleton = ({ rows }: { rows: number }) => (
  <div className={`${cardClass} overflow-hidden`}>
    <div className="flex h-11 items-center gap-2.5 border-b border-zinc-100 px-4 dark:border-zinc-800">
      <div className="size-4 animate-shimmer rounded bg-zinc-200/70 dark:bg-zinc-700/50" />
      <div className="h-3 w-28 animate-shimmer rounded bg-zinc-200/70 dark:bg-zinc-700/50" />
    </div>
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders with no identity
        <div key={index} className="flex gap-3 px-4 py-3">
          <div className="size-4 animate-shimmer rounded-full bg-zinc-200/70 dark:bg-zinc-700/50" />
          <div className="flex-1 space-y-2">
            <div
              className="h-3 animate-shimmer rounded bg-zinc-200/70 dark:bg-zinc-700/50"
              style={{ width: `${70 - ((index * 17) % 35)}%` }}
            />
            <div className="h-2.5 w-40 animate-shimmer rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  </div>
)

const SkeletonGrid = () => (
  <div role="status" className="grid gap-4 lg:grid-cols-2 lg:items-start">
    <span className="sr-only">Loading your dashboard…</span>
    <div className="flex flex-col gap-4">
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={4} />
    </div>
    <div className="flex flex-col gap-4">
      <SectionSkeleton rows={2} />
      <SectionSkeleton rows={3} />
    </div>
  </div>
)

export const DashboardView = () => {
  const viewer = useViewer()
  const queryClient = useQueryClient()
  const dashboard = useQuery({
    queryKey: DASHBOARD,
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  // Only a refresh the user asked for spins, not the minutely background poll.
  const [refreshing, setRefreshing] = useState(false)
  const refresh = () => {
    setRefreshing(true)
    void Promise.allSettled([
      dashboard.refetch(),
      queryClient.refetchQueries({ queryKey: ACTIVITY }),
    ]).finally(() => setRefreshing(false))
  }
  const retry = () => void dashboard.refetch()
  const now = new Date()
  const data = dashboard.data
  const firstName = viewer.name.split(/\s+/)[0] || viewer.login
  const homes = data === undefined ? null : homeSections(data)

  const renderSection = (key: SectionKey, data: Dashboard) => {
    const { id, title, icon, empty } = SECTIONS[key]
    const shared = { id, title, icon, empty, onRetry: retry, retrying: dashboard.isFetching }
    if (key === "notifications") {
      return (
        <SectionCard<NotificationItem>
          key={key}
          {...shared}
          section={data.notifications}
          itemKey={(notification) => notification.id}
          renderItem={(notification) => <NotificationRow notification={notification} />}
        />
      )
    }
    return (
      <SectionCard<DashboardItem>
        key={key}
        {...shared}
        section={data[key]}
        itemKey={itemRef}
        renderItem={(item) => {
          const home = homes?.get(itemRef(item))
          return (
            <ItemRow
              item={item}
              alsoIn={home === undefined || home === key ? undefined : SHORT_TITLES[home]}
            />
          )
        }}
      />
    )
  }

  return (
    <main className={`${pageContainer} pt-6 pb-10 sm:pt-8`}>
      <header className="mb-6 sm:mb-8">
        <div className="flex h-8 items-center justify-between gap-3">
          <p className="text-2xs font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <div className="flex items-center gap-1">
            {dashboard.dataUpdatedAt > 0 && (
              <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
                {dashboard.isError ? "Refresh failed, last loaded" : "Updated"}{" "}
                {relativeTime(new Date(dashboard.dataUpdatedAt).toISOString())}
              </span>
            )}
            {/* With nothing loaded, the error notice's Retry is the one way to try again. */}
            {!(dashboard.data === undefined && dashboard.isError) && (
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className={`${buttonClass.ghost} -mr-2.5`}
              >
                <RefreshIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            )}
          </div>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {greeting(now.getHours())}, {firstName}
        </h1>
        {data !== undefined ? (
          <div className="mt-1.5">
            <Summary data={data} />
          </div>
        ) : (
          !dashboard.isError && (
            <div className="mt-3.5 mb-1.5 h-3 w-64 max-w-full animate-shimmer rounded bg-zinc-200/70 dark:bg-zinc-800" />
          )
        )}
        <p className="sr-only" aria-live="polite">
          {refreshing ? "Refreshing dashboard" : ""}
        </p>
      </header>

      {data === undefined ? (
        dashboard.isError ? (
          <ErrorNotice
            title="Could not load your dashboard"
            onRetry={retry}
            retrying={dashboard.isFetching}
          >
            {dashboard.error.message}
          </ErrorNotice>
        ) : (
          <SkeletonGrid />
        )
      ) : (
        <>
          {dashboard.isError && (
            <ErrorNotice
              tone="warning"
              title="Could not refresh your dashboard"
              onRetry={retry}
              retrying={dashboard.isFetching}
              className="mb-4"
            >
              {`These items were loaded ${relativeTime(new Date(dashboard.dataUpdatedAt).toISOString())}. ${dashboard.error.message}`}
            </ErrorNotice>
          )}
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            {COLUMNS.map((column) => (
              <div key={column.join()} className="flex min-w-0 flex-col gap-4">
                {column.map((key) => renderSection(key, data))}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4">
        <ActivityCard />
      </div>
    </main>
  )
}
