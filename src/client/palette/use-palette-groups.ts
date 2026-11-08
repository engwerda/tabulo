import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import type { DashboardItem } from "../../shared/api.ts"
import { fetchDashboard, fetchInstance, fetchOrgRepos, fetchOrgs, fetchSearch } from "../api.ts"
import { DASHBOARD } from "../Dashboard.tsx"
import { ORGS } from "../scope/OrgPicker.tsx"
import { readRememberedRepos, useLastScope } from "../scope/remembered.ts"
import { ORG_VIEWS, type OrgViewId, orgViewHref } from "../scope/views.ts"
import {
  setThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
  useThemePreference,
} from "../theme.ts"
import type { GlyphName } from "./icons.tsx"
import type { GroupSpec, Searchable } from "./rank.ts"
import type { ShortcutId } from "./shortcuts.ts"

export type RunContext = {
  readonly navigate: (to: string) => void
  readonly openShortcuts: () => void
  /** Keeps the palette open to report how `task` went, then closes it if it succeeded. */
  readonly report: (task: Promise<unknown>, success: string, failure: string) => void
  readonly signOut: () => void
}

export type Badge = {
  readonly text: string
  readonly tone: "open" | "closed" | "neutral" | "current"
}

export type PaletteItem = Searchable & {
  readonly icon: GlyphName
  readonly badge?: Badge
  readonly shortcut?: ShortcutId
  readonly external?: boolean
  /** Items of the issue search are not remembered: they are not there when the query is empty. */
  readonly remember: boolean
  readonly run: (context: RunContext) => void
}

export type SearchStatus = "idle" | "loading" | "error" | "done"

const DEBOUNCE_MS = 200
const MIN_SEARCH_LENGTH = 2

const useDebounced = (value: string) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [value])
  return debounced
}

const parseRepos = (selection: string | null) =>
  (selection ?? "").split(",").filter((name) => name !== "")

const THEME_LABELS: Record<ThemePreference, { label: string; icon: GlyphName }> = {
  system: { label: "System", icon: "system" },
  light: { label: "Light", icon: "light" },
  dark: { label: "Dark", icon: "dark" },
}

const VIEW_SHORTCUTS: Record<OrgViewId, ShortcutId> = {
  board: "go-board",
  insights: "go-insights",
  epics: "go-epics",
}

const openExternal = (url: string) => window.open(url, "_blank", "noopener,noreferrer")

const issueItem = (
  item: DashboardItem,
  id: string,
  extra: { readonly keywords?: string; readonly badge: Badge; readonly remember: boolean },
): PaletteItem => ({
  id,
  title: item.title,
  subtitle: `${item.repo}#${item.number}`,
  icon: item.kind,
  external: true,
  run: () => openExternal(item.url),
  ...extra,
})

const WORK_SECTIONS = [
  { key: "reviewRequests", label: "Review" },
  { key: "assigned", label: "Assigned" },
  { key: "mentioned", label: "Mention" },
] as const

/**
 * The palette's groups for `query`. Everything but the issue search comes from queries
 * the app already made; the palette fetches only what is still missing.
 */
export const usePaletteGroups = (query: string, active: boolean) => {
  const lastScope = useLastScope()
  const currentTheme = useThemePreference()
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs, enabled: active })
  const org = lastScope?.org ?? orgs.data?.[0]?.name
  const repos = useQuery({
    queryKey: ["org-repos", org],
    queryFn: () => fetchOrgRepos(org ?? ""),
    enabled: active && org !== undefined,
  })
  const dashboard = useQuery({ queryKey: DASHBOARD, queryFn: fetchDashboard, enabled: false })
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: fetchInstance,
    enabled: active,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const text = query.trim()
  const debounced = useDebounced(text)
  const searching = text.length >= MIN_SEARCH_LENGTH
  const search = useQuery({
    queryKey: ["search", debounced],
    queryFn: ({ signal }) => fetchSearch(debounced, signal),
    enabled: active && debounced.length >= MIN_SEARCH_LENGTH,
    staleTime: 30_000,
    retry: false,
  })
  // Results of an earlier query must not stay selectable while the current one loads.
  const searchItems = searching && debounced === text ? search.data?.items : undefined

  const orgList = orgs.data
  const forgejoUrl = instance.data?.forgejoUrl
  const dashboardData = dashboard.data

  const groups = useMemo((): ReadonlyArray<GroupSpec<PaletteItem>> => {
    const lastOrg = lastScope?.org ?? (orgList?.length === 1 ? orgList[0]?.name : undefined)

    const navigation: Array<PaletteItem> = [
      {
        id: "nav:dashboard",
        title: "Dashboard",
        subtitle: "Your work",
        keywords: "home go",
        icon: "dashboard",
        shortcut: "go-dashboard",
        remember: true,
        run: ({ navigate }) => navigate("/"),
      },
    ]
    if (orgList === undefined || orgList.length === 0) {
      for (const view of ORG_VIEWS) {
        navigation.push({
          id: `nav:${view.id}`,
          title: view.label,
          subtitle: "Choose an organization",
          keywords: "go",
          icon: view.icon,
          remember: true,
          run: ({ navigate }) => navigate(orgViewHref(view.id)),
        })
      }
    }
    for (const entry of orgList ?? []) {
      const remembered = parseRepos(readRememberedRepos(entry.name))
      for (const view of ORG_VIEWS) {
        navigation.push({
          id: `nav:${view.id}:${entry.name}`,
          title: view.label,
          subtitle: entry.fullName || entry.name,
          keywords: `go ${entry.name}`,
          icon: view.icon,
          remember: true,
          ...(entry.name === lastOrg ? { shortcut: VIEW_SHORTCUTS[view.id] } : {}),
          run: ({ navigate }) =>
            navigate(
              orgViewHref(
                view.id,
                entry.name,
                entry.name === lastOrg ? lastScope?.repos : remembered,
              ),
            ),
        })
      }
    }

    const repositories: Array<PaletteItem> = []
    if (org !== undefined) {
      const active = (repos.data ?? []).filter((repo) => !repo.archived)
      for (const repo of active) {
        repositories.push({
          id: `repo:board:${repo.fullName}`,
          title: repo.name,
          subtitle: `${org} · Open its board`,
          keywords: "board repository",
          icon: "repository",
          remember: true,
          run: ({ navigate }) => navigate(orgViewHref("board", org, [repo.name])),
        })
      }
      if (forgejoUrl !== undefined) {
        for (const repo of active) {
          repositories.push({
            id: `repo:forgejo:${repo.fullName}`,
            title: repo.name,
            subtitle: `${org} · Open in Forgejo`,
            keywords: "forgejo repository open",
            icon: "external",
            external: true,
            remember: true,
            run: () => openExternal(`${forgejoUrl}/${repo.fullName}`),
          })
        }
      }
    }

    const work: Array<PaletteItem> = []
    const seen = new Set<string>()
    for (const { key, label } of WORK_SECTIONS) {
      const section = dashboardData?.[key]
      if (section?._tag !== "Loaded") continue
      for (const item of section.items) {
        if (seen.has(item.url)) continue
        seen.add(item.url)
        work.push(
          issueItem(item, `work:${item.url}`, {
            keywords: label,
            badge: { text: label, tone: "neutral" },
            remember: true,
          }),
        )
      }
    }

    const theme: Array<PaletteItem> = THEME_PREFERENCES.map((preference) => ({
      id: `action:theme:${preference}`,
      title: `Theme: ${THEME_LABELS[preference].label}`,
      keywords: "appearance color mode switch",
      icon: THEME_LABELS[preference].icon,
      remember: true,
      ...(preference === currentTheme ? { badge: { text: "Current", tone: "current" } } : {}),
      run: () => setThemePreference(preference),
    }))
    const actions: Array<PaletteItem> = [
      ...theme,
      {
        id: "action:copy-link",
        title: "Copy link to this page",
        keywords: "url share address",
        icon: "link",
        remember: true,
        run: ({ report }) =>
          report(
            new Promise((resolve) => resolve(navigator.clipboard.writeText(window.location.href))),
            "Link copied",
            "Could not copy the link",
          ),
      },
      {
        id: "action:shortcuts",
        title: "Show keyboard shortcuts",
        keywords: "help keys hotkeys",
        icon: "keyboard",
        shortcut: "shortcuts",
        remember: true,
        run: ({ openShortcuts }) => openShortcuts(),
      },
      {
        id: "action:sign-out",
        title: "Sign out",
        keywords: "log out logout",
        icon: "signout",
        remember: true,
        run: ({ signOut }) => signOut(),
      },
    ]

    const issues: ReadonlyArray<PaletteItem> = (searchItems ?? []).map((item) =>
      issueItem(item, `issue:${item.url}`, {
        badge:
          item.state === "open"
            ? { text: "Open", tone: "open" }
            : { text: "Closed", tone: "closed" },
        remember: false,
      }),
    )

    return [
      {
        id: "navigation",
        heading: "Navigation",
        items: navigation,
        limit: 8,
        emptyLimit: 12,
        filter: true,
      },
      {
        id: "repositories",
        heading: org === undefined ? "Repositories" : `Repositories in ${org}`,
        items: repositories,
        limit: 6,
        emptyLimit: 5,
        filter: true,
      },
      { id: "work", heading: "Your work", items: work, limit: 5, emptyLimit: 4, filter: true },
      { id: "actions", heading: "Actions", items: actions, limit: 8, emptyLimit: 8, filter: true },
      {
        id: "issues",
        heading: "Issues and pull requests",
        items: issues,
        limit: 10,
        emptyLimit: 0,
        filter: false,
      },
    ]
  }, [lastScope, orgList, org, repos.data, forgejoUrl, dashboardData, searchItems, currentTheme])

  const status: SearchStatus = !searching
    ? "idle"
    : debounced !== text || search.isFetching
      ? "loading"
      : search.isError
        ? "error"
        : "done"
  return {
    groups,
    searchStatus: status,
    searchError: search.error?.message,
    minSearchLength: MIN_SEARCH_LENGTH,
  }
}
