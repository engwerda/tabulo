import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type ComponentType, lazy, Suspense } from "react"
import { Link, Route, Switch, useLocation } from "wouter"
import type { User } from "../shared/api.ts"
import { Avatar } from "./Avatar.tsx"
import { signOut } from "./api.ts"
import { DashboardView } from "./Dashboard.tsx"
import { Glyph, type GlyphName, SearchIcon } from "./palette/icons.tsx"
import { ShortcutKeys } from "./palette/keys.tsx"
import { PaletteProvider, usePalette } from "./palette/PaletteProvider.tsx"
import { OrgPicker } from "./scope/OrgPicker.tsx"
import { useLastScope } from "./scope/remembered.ts"
import { isOrgViewPath, ORG_VIEWS, type OrgViewId, orgViewHref } from "./scope/views.ts"
import { SESSION_USER, useSession } from "./session.ts"
import { ThemeControl } from "./ThemeControl.tsx"
import { ErrorBoundary } from "./ui/ErrorBoundary.tsx"
import { ArrowRightIcon, LogoMark, SignOutIcon } from "./ui/icons.tsx"
import { buttonClass, Popover } from "./ui/primitives.tsx"

/** A still life of a board, drawn with the app's own surfaces, for the sign-in page. */
const BoardSketch = () => {
  const columns = [
    { name: "Todo", dot: "bg-zinc-400", cards: [[70, 45], [85], [60, 50]] },
    { name: "In Progress", dot: "bg-amber-500", cards: [[90, 40], [65]] },
    { name: "Review", dot: "bg-violet-500", cards: [[75, 55]] },
    { name: "Done", dot: "bg-emerald-500", cards: [[80], [55, 35]] },
  ]
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-4 gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-100/70 p-2 shadow-[0_24px_60px_-24px_rgb(79_70_229/0.35)] dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]"
    >
      {columns.map((column, columnIndex) => (
        <div key={column.name} className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-1">
            <span className={`size-1.5 rounded-full ${column.dot}`} />
            <span className="truncate text-2xs font-medium text-zinc-500 dark:text-zinc-400">
              {column.name}
            </span>
          </div>
          {column.cards.map((lines, cardIndex) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed drawing, never reordered
              key={cardIndex}
              style={{ animationDelay: `${120 + columnIndex * 70 + cardIndex * 50}ms` }}
              className="animate-sketch-in space-y-1.5 rounded-lg border border-zinc-200/80 bg-white p-2 dark:border-zinc-700/60 dark:bg-zinc-800"
            >
              {lines.map((width, lineIndex) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed drawing, never reordered
                  key={lineIndex}
                  style={{ width: `${width}%` }}
                  className={`h-1.5 rounded-full ${lineIndex === 0 ? "bg-zinc-300 dark:bg-zinc-600" : "bg-zinc-200 dark:bg-zinc-700"}`}
                />
              ))}
              <div className="flex items-center gap-1 pt-0.5">
                <span className="h-1.5 w-5 rounded-full bg-indigo-200 dark:bg-indigo-500/40" />
                <span className="ml-auto size-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const SIGN_IN_POINTS = [
  { icon: "dashboard", text: "Review requests, assignments, and mentions on one page" },
  { icon: "board", text: "A board across repositories that moves issues in Forgejo" },
  { icon: "insights", text: "Throughput, backlog, and CI health at a glance" },
] as const satisfies ReadonlyArray<{ icon: GlyphName; text: string }>

const SignIn = () => (
  <main className="relative isolate grid min-h-dvh overflow-hidden px-6 py-12 lg:grid-cols-2 lg:place-items-center lg:gap-16 lg:px-16">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(56rem_28rem_at_15%_-10%,rgb(99_102_241/0.16),transparent),radial-gradient(40rem_24rem_at_100%_110%,rgb(139_92_246/0.10),transparent)] dark:bg-[radial-gradient(56rem_28rem_at_15%_-10%,rgb(99_102_241/0.22),transparent),radial-gradient(40rem_24rem_at_100%_110%,rgb(139_92_246/0.14),transparent)]"
    />
    <div className="mx-auto flex w-full max-w-md flex-col justify-center lg:mx-0 lg:justify-self-end">
      <div className="flex items-center gap-2.5">
        <LogoMark className="size-9" />
        <span className="text-lg font-semibold tracking-tight">Tabulo</span>
      </div>
      <h1 className="mt-10 text-4xl font-semibold tracking-tight text-balance sm:text-5xl sm:leading-[1.05]">
        Plan your Forgejo work in one calm place.
      </h1>
      <p className="mt-4 text-base text-pretty text-zinc-600 dark:text-zinc-400">
        Tabulo reads your issues and pull requests as you, and writes every change back to Forgejo.
        Nothing to install on the server.
      </p>
      <ul className="mt-8 space-y-3">
        {SIGN_IN_POINTS.map(({ icon, text }) => (
          <li
            key={icon}
            className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 shadow-card ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:text-indigo-400 dark:ring-zinc-800">
              <Glyph name={icon} />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <a
        href="/auth/login"
        className={`${buttonClass.primary} mt-10 h-11 w-full text-[0.9375rem] sm:w-auto sm:self-start sm:px-6`}
      >
        Sign in with Forgejo
        <ArrowRightIcon className="size-4" />
      </a>
      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Tabulo acts as you in Forgejo. It stores nothing but your session and card order.
      </p>
    </div>
    <div className="mt-14 hidden w-full max-w-xl sm:block lg:mt-0 lg:justify-self-start">
      <BoardSketch />
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

type NavItem = {
  readonly href: string
  readonly label: string
  readonly icon: GlyphName
  readonly active: boolean
}

/** The header's links; an organization view returns to the last organization and its repositories. */
const useNav = (): ReadonlyArray<NavItem> => {
  const [path] = useLocation()
  const lastScope = useLastScope()
  return [
    { href: "/", label: "Dashboard", icon: "dashboard", active: path === "/" },
    ...ORG_VIEWS.map((view) => ({
      href: orgViewHref(view.id, lastScope?.org, lastScope?.repos),
      label: view.label,
      icon: view.icon,
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

const UserMenu = ({ user, logout }: { user: User; logout: ReturnType<typeof useSignOut> }) => (
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
          <ThemeControl />
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

const Header = ({ user, logout }: { user: User; logout: ReturnType<typeof useSignOut> }) => {
  const nav = useNav()
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-lg dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 rounded-lg" aria-label="Tabulo home">
            <LogoMark />
            <span className="text-[0.9375rem] font-semibold tracking-tight max-md:hidden">
              Tabulo
            </span>
          </Link>
          <nav aria-label="Main" className="max-md:hidden">
            <ul className="flex gap-0.5">
              {nav.map(({ href, label, icon, active }) => (
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
                      <Glyph name={icon} />
                    </span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <CurrentViewTitle nav={nav} />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <SearchButton />
          <UserMenu user={user} logout={logout} />
        </div>
      </div>
    </header>
  )
}

/** On a phone the tab bar names the view at the bottom; the header repeats it beside the logo. */
const CurrentViewTitle = ({ nav }: { nav: ReadonlyArray<NavItem> }) => {
  const current = nav.find((item) => item.active)
  return current === undefined ? null : (
    <span
      aria-hidden="true"
      className="truncate text-[0.9375rem] font-semibold tracking-tight md:hidden"
    >
      {current.label}
    </span>
  )
}

/** The phone's main navigation: a labeled tab bar along the bottom edge, within thumb reach. */
const TabBar = () => {
  const nav = useNav()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden dark:border-zinc-800/80 dark:bg-zinc-950/90"
    >
      <ul className="grid h-14 grid-cols-4">
        {nav.map(({ href, label, icon, active }) => (
          <li key={label} className="flex">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium transition ${
                active
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-zinc-500 active:text-zinc-900 dark:text-zinc-400 dark:active:text-zinc-100"
              }`}
            >
              <span
                className={`grid h-6 w-12 place-items-center rounded-full transition ${active ? "bg-indigo-50 dark:bg-indigo-500/15" : ""}`}
              >
                <Glyph name={icon} />
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

const NotFound = () => (
  <main className="grid flex-1 place-items-center px-6 py-24">
    <div className="max-w-sm text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-white text-zinc-400 shadow-card ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:text-zinc-500 dark:ring-zinc-800">
        <SearchIcon className="size-5" />
      </span>
      <p className="mt-6 text-sm font-semibold text-indigo-600 tabular-nums dark:text-indigo-400">
        404
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        There is nothing at this address.
        <span className="pointer-coarse:hidden">
          {" "}
          Search with{" "}
          <span className="whitespace-nowrap">
            <ShortcutKeys id="palette" />
          </span>{" "}
          or head back to your dashboard.
        </span>
      </p>
      <Link href="/" className={`${buttonClass.primary} mt-6`}>
        Go to the dashboard
      </Link>
    </div>
  </main>
)

/** Shown while a view's code loads on its first visit. */
const ViewLoading = () => (
  <div role="status" className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
    <span className="sr-only">Loading…</span>
    <div className="h-8 w-64 max-w-full animate-shimmer rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
    <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-64 animate-shimmer rounded-xl bg-zinc-200/50 max-sm:[&:nth-child(n+2)]:hidden dark:bg-zinc-800/50"
        />
      ))}
    </div>
  </div>
)

const SignedIn = ({ user }: { user: User }) => {
  const [location] = useLocation()
  const logout = useSignOut()
  return (
    <PaletteProvider signOut={() => logout.mutate()}>
      <div className="flex min-h-dvh flex-col">
        <a
          href="#content"
          className="sr-only rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-pop focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to content
        </a>
        <Header user={user} logout={logout} />
        <div
          id="content"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col pb-(--tab-bar-height) focus:outline-none"
        >
          <ErrorBoundary resetKey={location}>
            <Suspense fallback={<ViewLoading />}>
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
          </ErrorBoundary>
        </div>
        <TabBar />
      </div>
    </PaletteProvider>
  )
}

/** The first paint while the session is checked: the mark alone, fading in only if it takes a while. */
const SessionLoading = () => (
  <main className="grid min-h-dvh place-items-center">
    <div role="status" className="animate-[fade-in_400ms_ease-out_300ms_both]">
      <LogoMark className="size-10 animate-shimmer" />
      <span className="sr-only">Loading Tabulo…</span>
    </div>
  </main>
)

export const App = () => {
  const session = useSession()
  if (session.isPending) return <SessionLoading />
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
