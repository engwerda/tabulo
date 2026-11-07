import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import type { Dashboard, DashboardItem, NotificationItem, Section } from "../shared/api.ts"
import { fetchDashboard } from "./api.ts"
import { ItemRow, KindIcon, NotificationRow } from "./rows.tsx"
import { SectionCard } from "./SectionCard.tsx"
import { useViewer } from "./session.ts"
import {
  BellIcon,
  CommentIcon,
  IssueOpenIcon,
  PullIcon,
  RefreshIcon,
  UserIcon,
} from "./ui/icons.tsx"
import { buttonClass } from "./ui/primitives.tsx"

export const DASHBOARD = ["dashboard"] as const

const ITEM_SECTIONS = [
  {
    key: "reviewRequests",
    title: "Review requests",
    icon: <PullIcon />,
    empty: "No pull requests are waiting for your review.",
  },
  {
    key: "assigned",
    title: "Assigned to me",
    icon: <UserIcon />,
    empty: "Nothing open is assigned to you.",
  },
  {
    key: "mentioned",
    title: "Mentions",
    icon: <CommentIcon />,
    empty: "No open issues or pull requests mention you.",
  },
  {
    key: "created",
    title: "Created by me",
    icon: <IssueOpenIcon />,
    empty: "You have no open issues or pull requests.",
  },
] as const satisfies ReadonlyArray<{
  key: keyof Dashboard
  title: string
  icon: ReactNode
  empty: string
}>

const total = (section: Section<unknown>) => (section._tag === "Loaded" ? section.total : null)

const greeting = (hour: number) =>
  hour < 5
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : hour < 18
        ? "Good afternoon"
        : "Good evening"

const Stat = ({
  href,
  label,
  value,
  kind,
}: {
  href: string
  label: string
  value: number | null
  kind: Parameters<typeof KindIcon>[0]["kind"]
}) => (
  <a
    href={href}
    className="group flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card transition hover:-translate-y-px hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
  >
    <KindIcon kind={kind} />
    <span className="min-w-0">
      <span className="block text-2xl leading-7 font-semibold tracking-tight tabular-nums">
        {value ?? "–"}
      </span>
      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
    </span>
  </a>
)

const SkeletonGrid = () => (
  <div aria-hidden="true">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-[4.75rem] animate-shimmer rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        />
      ))}
    </div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-56 animate-shimmer rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        />
      ))}
    </div>
  </div>
)

export const DashboardView = () => {
  const viewer = useViewer()
  const dashboard = useQuery({
    queryKey: DASHBOARD,
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const retry = () => void dashboard.refetch()
  const now = new Date()
  const data = dashboard.data
  const firstName = viewer.name.split(/\s+/)[0] || viewer.login

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting(now.getHours())}, {firstName}
          </h1>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={dashboard.isFetching}
          className={buttonClass.secondary}
        >
          <RefreshIcon className={`size-4 ${dashboard.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {dashboard.isFetching ? "Refreshing dashboard" : ""}
      </p>

      <div className="mt-6">
        {data === undefined ? (
          dashboard.isError ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              <p>Could not load the dashboard: {dashboard.error.message}</p>
              <button type="button" onClick={retry} className={buttonClass.secondary}>
                Retry
              </button>
            </div>
          ) : (
            <SkeletonGrid />
          )
        ) : (
          <>
            <nav
              aria-label="Summary"
              className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] *:min-w-[12rem] *:flex-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:*:min-w-0 lg:grid-cols-4"
            >
              <Stat
                href="#review-requests"
                label="Reviews waiting"
                value={total(data.reviewRequests)}
                kind="pull"
              />
              <Stat
                href="#assigned"
                label="Assigned to me"
                value={total(data.assigned)}
                kind="assigned"
              />
              <Stat
                href="#mentioned"
                label="Mentions"
                value={total(data.mentioned)}
                kind="mention"
              />
              <Stat
                href="#notifications"
                label="Unread"
                value={total(data.notifications)}
                kind="notification"
              />
            </nav>
            <div className="mt-6 gap-4 lg:columns-2 [&>section]:mb-4 [&>section]:break-inside-avoid">
              {ITEM_SECTIONS.map(({ key, title, icon, empty }) => (
                <SectionCard<DashboardItem>
                  key={key}
                  id={key === "reviewRequests" ? "review-requests" : key}
                  title={title}
                  icon={icon}
                  empty={empty}
                  section={data[key]}
                  itemKey={(item) => `${item.repo}#${item.number}`}
                  renderItem={(item) => <ItemRow item={item} />}
                  onRetry={retry}
                  retrying={dashboard.isFetching}
                />
              ))}
              <SectionCard<NotificationItem>
                id="notifications"
                title="Unread notifications"
                icon={<BellIcon />}
                empty="You are all caught up."
                section={data.notifications}
                itemKey={(notification) => notification.id}
                renderItem={(notification) => <NotificationRow notification={notification} />}
                onRetry={retry}
                retrying={dashboard.isFetching}
              />
            </div>
          </>
        )}
      </div>
    </main>
  )
}
