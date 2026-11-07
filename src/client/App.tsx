import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Dashboard, DashboardItem, NotificationItem, User } from "../shared/api.ts"
import { Avatar } from "./Avatar.tsx"
import { fetchDashboard, fetchSessionUser, signOut, Unauthenticated } from "./api.ts"
import { ItemRow, NotificationRow } from "./rows.tsx"
import { SectionCard } from "./SectionCard.tsx"

const SESSION_USER = ["session-user"] as const
const DASHBOARD = ["dashboard"] as const

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

const SignIn = () => (
  <main className="grid min-h-dvh place-items-center px-6">
    <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="text-2xl font-semibold tracking-tight">Tabulo</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Your review requests, assignments, mentions, and notifications from Forgejo on one page.
      </p>
      <a
        href="/auth/login"
        className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        Sign in with Forgejo
      </a>
    </div>
  </main>
)

const Header = ({ user }: { user: User }) => {
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: DASHBOARD })
      queryClient.setQueryData(SESSION_USER, null)
    },
  })
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">Tabulo</span>
        <div className="flex items-center gap-3">
          <Avatar url={user.avatarUrl} name={user.name} />
          <span className="hidden text-sm sm:inline">
            <span className="font-medium">{user.name}</span>{" "}
            <span className="text-zinc-500 dark:text-zinc-400">@{user.login}</span>
          </span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

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

const DashboardView = ({ user }: { user: User }) => {
  const queryClient = useQueryClient()
  const dashboard = useQuery({
    queryKey: DASHBOARD,
    queryFn: async () => {
      try {
        return await fetchDashboard()
      } catch (error) {
        if (error instanceof Unauthenticated) queryClient.setQueryData(SESSION_USER, null)
        throw error
      }
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const retry = () => void dashboard.refetch()

  return (
    <>
      <Header user={user} />
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
    </>
  )
}

export const App = () => {
  const session = useQuery({ queryKey: SESSION_USER, queryFn: fetchSessionUser })
  if (session.isPending) return null
  if (session.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-sm">
        <div role="alert" className="flex flex-col items-center gap-3">
          <p>Tabulo could not reach its server: {session.error.message}</p>
          <button
            type="button"
            onClick={() => void session.refetch()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700"
          >
            Retry
          </button>
        </div>
      </main>
    )
  }
  return session.data === null ? <SignIn /> : <DashboardView user={session.data} />
}
