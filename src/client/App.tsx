import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ComponentType, lazy, Suspense } from "react"
import { Link, Route, Switch, useLocation } from "wouter"
import type { User } from "../shared/api.ts"
import { Avatar } from "./Avatar.tsx"
import { fetchSessionUser, signOut } from "./api.ts"
import { DashboardView } from "./Dashboard.tsx"
import { SearchIcon } from "./palette/icons.tsx"
import { ShortcutKeys } from "./palette/keys.tsx"
import { PaletteProvider, usePalette } from "./palette/PaletteProvider.tsx"
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

// Each view loads on first visit, so the dashboard does not download drag and drop or charts.
const ORG_VIEW_PAGES: Record<OrgViewId, ComponentType<{ org: string }>> = {
  board: lazy(() => import("./board/BoardPage.tsx").then((m) => ({ default: m.BoardPage }))),
  insights: lazy(() =>
    import("./insights/InsightsPage.tsx").then((m) => ({ default: m.InsightsPage })),
  ),
  epics: lazy(() => import("./epics/EpicsPage.tsx").then((m) => ({ default: m.EpicsPage }))),
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

const useSignOut = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(SESSION_USER, null)
    },
  })
}

const SearchButton = () => {
  const { openPalette } = usePalette()
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-500 shadow-[0_1px_0_rgb(0_0_0/0.03)] transition-colors hover:border-zinc-300 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:w-52 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-none dark:hover:border-zinc-600 dark:hover:text-zinc-200"
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="sr-only sm:not-sr-only sm:flex-1 sm:text-left">Search…</span>
      <span className="hidden sm:block">
        <ShortcutKeys id="palette" />
      </span>
    </button>
  )
}

const Header = ({ user, logout }: { user: User; logout: ReturnType<typeof useSignOut> }) => {
  const nav = useNav()
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
          <SearchButton />
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

const SignedIn = ({ user }: { user: User }) => {
  const logout = useSignOut()
  return (
    <PaletteProvider signOut={() => logout.mutate()}>
      <Header user={user} logout={logout} />
      <Suspense fallback={null}>
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
      </Suspense>
    </PaletteProvider>
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
  return session.data === null ? <SignIn /> : <SignedIn user={session.data} />
}
