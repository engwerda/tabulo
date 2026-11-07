import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { Link, Route, Switch, useLocation } from "wouter"
import type { User } from "../shared/api.ts"
import { Avatar } from "./Avatar.tsx"
import { signOut } from "./api.ts"
import { BoardPage, LAST_BOARD_KEY } from "./board/BoardPage.tsx"
import { OrgPicker } from "./board/OrgPicker.tsx"
import { DashboardView } from "./Dashboard.tsx"
import { SESSION_USER, useSession } from "./session.ts"
import { setTheme, type ThemeChoice, useTheme } from "./theme.ts"
import { ErrorBoundary } from "./ui/ErrorBoundary.tsx"
import {
  ColumnsIcon,
  DashboardIcon,
  LogoMark,
  MonitorIcon,
  MoonIcon,
  SignOutIcon,
  SunIcon,
} from "./ui/icons.tsx"
import { buttonClass, Popover } from "./ui/primitives.tsx"

const SignIn = () => (
  <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(99_102_241/0.18),transparent)] dark:bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(99_102_241/0.25),transparent)]"
    />
    <div className="relative w-full max-w-sm text-center">
      <LogoMark className="mx-auto size-12" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Tabulo</h1>
      <p className="mt-3 text-balance text-zinc-600 dark:text-zinc-400">
        Plan your work on Forgejo. Your review requests and assignments on one page, and a board
        across your repositories.
      </p>
      <a href="/auth/login" className={`${buttonClass.primary} mt-8 h-10 w-full text-[0.9375rem]`}>
        Sign in with Forgejo
      </a>
      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
        Tabulo acts as you in Forgejo. It stores nothing but your session and card order.
      </p>
    </div>
  </main>
)

const lastBoard = () => {
  try {
    return window.localStorage.getItem(LAST_BOARD_KEY)
  } catch {
    return null
  }
}

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: <DashboardIcon />,
    isActive: (path: string) => path === "/",
  },
  {
    href: "/board",
    label: "Board",
    icon: <ColumnsIcon />,
    isActive: (path: string) => path.startsWith("/board"),
  },
] as const

const THEMES: ReadonlyArray<{ value: ThemeChoice; label: string; icon: ReactNode }> = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <MonitorIcon /> },
]

const ThemeSwitch = () => {
  const theme = useTheme()
  return (
    <fieldset className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      <legend className="sr-only">Theme</legend>
      {THEMES.map(({ value, label, icon }) => (
        <label
          key={value}
          title={label}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition has-focus-visible:outline-2 has-focus-visible:outline-indigo-500 ${
            theme === value
              ? "bg-white text-zinc-900 shadow-card dark:bg-zinc-700 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={() => setTheme(value)}
            className="sr-only"
          />
          {icon}
          {label}
        </label>
      ))}
    </fieldset>
  )
}

const UserMenu = ({ user }: { user: User }) => {
  const queryClient = useQueryClient()
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(SESSION_USER, null)
    },
  })
  return (
    <Popover
      align="end"
      chevron={false}
      accessibleLabel={`Account: ${user.name}`}
      triggerClass="flex items-center gap-2 rounded-full p-0.5 transition hover:ring-4 hover:ring-zinc-200/70 dark:hover:ring-zinc-800"
      label={<Avatar url={user.avatarUrl} name={user.name} />}
      panelClass="w-64 p-1.5"
    >
      {() => (
        <>
          <div className="flex items-center gap-3 px-2 pt-1.5 pb-3">
            <Avatar url={user.avatarUrl} name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">@{user.login}</p>
            </div>
          </div>
          <div className="px-1 pb-1.5">
            <ThemeSwitch />
          </div>
          <div className="border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <SignOutIcon className="size-4 text-zinc-400" />
              {logout.isPending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      )}
    </Popover>
  )
}

const Header = ({ user }: { user: User }) => {
  const [path] = useLocation()
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-lg dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 rounded-lg" aria-label="Tabulo home">
            <LogoMark />
            <span className="hidden text-[0.9375rem] font-semibold tracking-tight sm:inline">
              Tabulo
            </span>
          </Link>
          <nav aria-label="Main">
            <ul className="flex gap-0.5">
              {NAV.map(({ href: base, label, icon, isActive }) => {
                const active = isActive(path)
                // Board returns to the last board shown, unless that is where you are.
                const href = base === "/board" && !active ? (lastBoard() ?? base) : base
                return (
                  <li key={label}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                      }`}
                    >
                      <span className={active ? "text-indigo-600 dark:text-indigo-400" : ""}>
                        {icon}
                      </span>
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
        <UserMenu user={user} />
      </div>
    </header>
  )
}

const NotFound = () => (
  <main className="mx-auto max-w-md px-6 py-24 text-center">
    <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">404</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
      There is nothing at this address.
    </p>
    <Link href="/" className={`${buttonClass.primary} mt-6`}>
      Go to the dashboard
    </Link>
  </main>
)

const SignedIn = ({ user }: { user: User }) => {
  const [path] = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-pop focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <Header user={user} />
      <div id="content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
        <ErrorBoundary resetKey={path}>
          <Switch>
            <Route path="/" component={DashboardView} />
            <Route path="/board" component={OrgPicker} />
            <Route path="/board/:org">{({ org }) => <BoardPage key={org} org={org} />}</Route>
            <Route component={NotFound} />
          </Switch>
        </ErrorBoundary>
      </div>
    </div>
  )
}

export const App = () => {
  const session = useSession()
  if (session.isPending) return null
  if (session.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-sm">
        <div role="alert" className="flex max-w-sm flex-col items-center gap-4 text-center">
          <LogoMark className="size-10 opacity-60 grayscale" />
          <p>Tabulo could not reach its server: {session.error.message}</p>
          <button
            type="button"
            onClick={() => void session.refetch()}
            className={buttonClass.secondary}
          >
            Retry
          </button>
        </div>
      </main>
    )
  }
  return session.data === null ? <SignIn /> : <SignedIn user={session.data} />
}
