import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, Route, Switch, useLocation } from "wouter"
import type { User } from "../shared/api.ts"
import { Avatar } from "./Avatar.tsx"
import { fetchSessionUser, signOut } from "./api.ts"
import { BoardPage } from "./board/BoardPage.tsx"
import { OrgPicker } from "./board/OrgPicker.tsx"
import { DashboardView } from "./Dashboard.tsx"

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

const NAV = [
  { href: "/", label: "Dashboard", isActive: (path: string) => path === "/" },
  { href: "/board", label: "Board", isActive: (path: string) => path.startsWith("/board") },
] as const

const Header = ({ user }: { user: User }) => {
  const queryClient = useQueryClient()
  const [path] = useLocation()
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(SESSION_USER, null)
    },
  })
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold tracking-tight">Tabulo</span>
          <nav aria-label="Main">
            <ul className="flex gap-1">
              {NAV.map(({ href, label, isActive }) => {
                const active = isActive(path)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                        active
                          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
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
      <Route path="/board" component={OrgPicker} />
      <Route path="/board/:org">{({ org }) => <BoardPage key={org} org={org} />}</Route>
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
