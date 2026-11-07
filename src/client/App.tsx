import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ComponentType } from "react"
import { Link, Route, Switch, useLocation } from "wouter"
import type { User } from "../shared/api.ts"
import { Avatar } from "./Avatar.tsx"
import { fetchSessionUser, signOut } from "./api.ts"
import { BoardPage } from "./board/BoardPage.tsx"
import { DashboardView } from "./Dashboard.tsx"
import { EpicsPage } from "./epics/EpicsPage.tsx"
import { InsightsPage } from "./insights/InsightsPage.tsx"
import { OrgPicker } from "./scope/OrgPicker.tsx"
import { useLastScope } from "./scope/remembered.ts"
import { isOrgViewPath, ORG_VIEWS, type OrgViewId, orgViewHref } from "./scope/views.ts"
import { ThemeControl } from "./ThemeControl.tsx"

export const SESSION_USER = ["session-user"] as const

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

const ORG_VIEW_PAGES: Record<OrgViewId, ComponentType<{ org: string }>> = {
  board: BoardPage,
  insights: InsightsPage,
  epics: EpicsPage,
}

const useNav = () => {
  const [path] = useLocation()
  const lastScope = useLastScope()
  return [
    { href: "/", label: "Dashboard", active: path === "/" },
    ...ORG_VIEWS.map((view) => ({
      href: orgViewHref(view.id, lastScope?.org, lastScope?.repos),
      label: view.label,
      active: isOrgViewPath(view, path),
    })),
  ]
}

const Header = ({ user }: { user: User }) => {
  const queryClient = useQueryClient()
  const nav = useNav()
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(SESSION_USER, null)
    },
  })
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">Tabulo</span>
        <nav
          aria-label="Main"
          className="order-last -mx-1 w-full overflow-x-auto md:order-none md:w-auto"
        >
          <ul className="flex gap-1 px-1">
            {nav.map(({ href, label, active }) => (
              <li key={label}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ThemeControl />
          <Avatar url={user.avatarUrl} name={user.name} />
          <span className="hidden text-sm lg:inline">
            <span className="font-medium">{user.name}</span>{" "}
            <span className="text-zinc-500 dark:text-zinc-400">@{user.login}</span>
          </span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="shrink-0 whitespace-nowrap rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

const NotFound = () => (
  <main className="px-4 py-6 text-sm sm:px-6">
    <h1 className="text-lg font-semibold">Page not found</h1>
    <p className="mt-2">
      <Link href="/" className="font-medium text-indigo-700 underline dark:text-indigo-300">
        Go to the dashboard
      </Link>
    </p>
  </main>
)

const SignedIn = ({ user }: { user: User }) => (
  <>
    <Header user={user} />
    <Switch>
      <Route path="/" component={DashboardView} />
      {ORG_VIEWS.map(({ id, path }) => {
        const Page = ORG_VIEW_PAGES[id]
        return [
          <Route key={id} path={path}>
            <OrgPicker view={id} />
          </Route>,
          <Route key={`${id}/:org`} path={`${path}/:org`}>
            {({ org }) => <Page key={org} org={org} />}
          </Route>,
        ]
      })}
      <Route component={NotFound} />
    </Switch>
  </>
)

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
  return session.data === null ? <SignIn /> : <SignedIn user={session.data} />
}
