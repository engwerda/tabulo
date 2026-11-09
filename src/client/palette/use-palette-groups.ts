import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useRoute, useSearchParams } from "wouter"
import type { BoardCard, DashboardItem } from "../../shared/api.ts"
import {
  fetchBoard,
  fetchBoards,
  fetchDashboard,
  fetchInstance,
  fetchOrgRepos,
  fetchOrgs,
  fetchSearch,
  isNotFound,
} from "../api.ts"
import { boardQueryKey, boardsQueryKey } from "../board/board-view.ts"
import { DASHBOARD } from "../Dashboard.tsx"
import { boardCardHref } from "../epics/epics-view.ts"
import { ORGS } from "../scope/OrgPicker.tsx"
import { rememberedBoard, rememberedScope, useLastScope } from "../scope/remembered.ts"
import {
  boardHref,
  boardIdFromPath,
  ORG_VIEWS,
  type OrgViewId,
  type OrgViewParams,
  orgView,
  orgViewHref,
} from "../scope/views.ts"
import {
  setThemePreference,
  THEME_PREFERENCES,
  type ThemePreference,
  useThemePreference,
} from "../theme.ts"
import type { GlyphName, PaletteItem } from "./item.ts"
import { isMac } from "./keys.tsx"
import { pageSlot } from "./page-slot.ts"
import type { GroupSpec } from "./rank.ts"
import { type ShortcutId, shortcutKeys } from "./shortcuts.ts"

export type SearchStatus = "idle" | "loading" | "error" | "done"

const pageCommands = pageSlot<ReadonlyArray<GroupSpec<PaletteItem>>>([])

/**
 * Adds a page's own commands to the palette while the page is mounted. Groups marked
 * `contextual` lead the palette while the query is empty.
 */
export const usePageCommands = pageCommands.usePublish

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

/**
 * Where the page opens an issue: on an org view, the side panel of the board on screen when it is
 * one of its cards, or of the organization's last board; null for Forgejo.
 */
type IssueBoardHref = (item: DashboardItem) => string | null

/**
 * What makes a row the same issue whichever group lists it, and the references a query may
 * name it by exactly: `#66`, `66`, `web#66`, `acme/web#66`.
 */
const issueNames = (fullName: string, number: number) => {
  const reference = `${fullName}#${number}`
  return {
    identity: reference.toLowerCase(),
    aliases: [
      `#${number}`,
      `${number}`,
      `${fullName.slice(fullName.indexOf("/") + 1)}#${number}`,
      reference,
    ],
  }
}

const issueItem = (
  item: DashboardItem,
  id: string,
  issueBoardHref: IssueBoardHref,
  extra: { readonly keywords?: string; readonly hint?: string; readonly remember: boolean },
): PaletteItem => {
  const base = {
    id,
    title: item.title,
    subtitle: `${item.repo}#${item.number}`,
    ...issueNames(item.repo, item.number),
    icon: item.kind,
    kind: { type: item.kind, state: item.state },
    ...extra,
  }
  const href = issueBoardHref(item)
  if (href === null) return { ...base, external: true, run: () => openExternal(item.url) }
  return {
    ...base,
    enterLabel: "Open on the board",
    alternate: { label: "Open in Forgejo", run: () => openExternal(item.url) },
    run: ({ navigate }) => navigate(href),
  }
}

const WORK_SECTIONS = [
  { key: "reviewRequests", label: "Review requested" },
  { key: "assigned", label: "Assigned" },
  { key: "mentioned", label: "Mentioned" },
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
  const boards = useQuery({
    queryKey: boardsQueryKey(org ?? ""),
    queryFn: () => fetchBoards(org ?? ""),
    enabled: active && org !== undefined,
  })
  const dashboard = useQuery({ queryKey: DASHBOARD, queryFn: fetchDashboard, enabled: false })
  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: fetchInstance,
    enabled: active,
    staleTime: Number.POSITIVE_INFINITY,
  })

  // On an org view, an open issue opens in a board's side panel, as an epic's child does.
  const boardView = orgView("board")
  const [onBoard, boardRoute] = useRoute<OrgViewParams>(`${boardView.path}${boardView.route}`)
  const [onOrgPage, route] = useRoute("/:view/:org")
  const view = onBoard
    ? boardView
    : onOrgPage
      ? ORG_VIEWS.find(({ path }) => path === `/${route.view}`)
      : undefined
  const viewOrg = onBoard ? boardRoute.org : view === undefined ? undefined : route?.org
  const boardId = onBoard ? boardIdFromPath(boardRoute.board) : undefined
  const [params] = useSearchParams()
  // The board's own query; the palette only reads what the board has loaded.
  const board = useQuery({
    queryKey: boardQueryKey(viewOrg ?? "", boardId ?? ""),
    queryFn: () => fetchBoard(viewOrg ?? "", boardId),
    enabled: false,
  })
  const boardData = boardId === undefined || isNotFound(board.error) ? undefined : board.data
  const pageSearch = params.toString()
  // A card of the board on screen opens in its side panel and keeps the board's filters.
  const cardHref = useMemo(() => {
    if (viewOrg === undefined || boardId === undefined || boardData === undefined) return undefined
    return (card: BoardCard) => {
      const next = new URLSearchParams(pageSearch)
      next.set("card", `${card.repo}#${card.number}`)
      return boardHref(viewOrg, boardId, next)
    }
  }, [viewOrg, boardId, boardData, pageSearch])
  const lastBoard = viewOrg === undefined ? undefined : rememberedBoard(viewOrg)
  const issueBoardHref = useMemo((): IssueBoardHref => {
    if (viewOrg === undefined || lastBoard === undefined) return () => null
    if (boardData === undefined || cardHref === undefined) {
      return (item) => boardCardHref(viewOrg, lastBoard, item)
    }
    // The board on screen also knows which issues are its cards.
    const cards = new Map(boardData.cards.map((card) => [card.key.toLowerCase(), card]))
    return (item) => {
      const card = cards.get(`${item.repo}#${item.number}`.toLowerCase())
      return card === undefined ? null : cardHref(card)
    }
  }, [viewOrg, lastBoard, boardData, cardHref])

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
  const boardList = boards.data?.boards
  const forgejoUrl = instance.data?.forgejoUrl
  const dashboardData = dashboard.data

  const pageGroups = pageCommands.useValue()

  const groups = useMemo((): ReadonlyArray<GroupSpec<PaletteItem>> => {
    const lastOrg = lastScope?.org ?? (orgList?.length === 1 ? orgList[0]?.name : undefined)

    const navigation: Array<PaletteItem> = [
      {
        id: "nav:dashboard",
        title: "Dashboard",
        subtitle: "Your work",
        keywords: "home go",
        icon: "dashboard",
        keys: shortcutKeys("go-dashboard", isMac),
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
    // The organization in use comes first, so its views lead the list when the query is empty.
    const byRecency = [...(orgList ?? [])].sort(
      (a, b) => Number(b.name === lastOrg) - Number(a.name === lastOrg),
    )
    for (const entry of byRecency) {
      const remembered = rememberedScope(entry.name)
      for (const view of ORG_VIEWS) {
        navigation.push({
          id: `nav:${view.id}:${entry.name}`,
          title: view.label,
          subtitle: entry.fullName || entry.name,
          keywords: `go ${entry.name}`,
          icon: view.icon,
          remember: true,
          ...(entry.name === lastOrg ? { keys: shortcutKeys(VIEW_SHORTCUTS[view.id], isMac) } : {}),
          run: ({ navigate }) => navigate(orgViewHref(view.id, remembered)),
        })
      }
    }

    const orgName = orgList?.find((entry) => entry.name === org)?.fullName || org
    const onOrgBoard = (id: string) =>
      boardId === id && org !== undefined && viewOrg?.toLowerCase() === org.toLowerCase()
    const boardItems: ReadonlyArray<PaletteItem> =
      org === undefined
        ? []
        : (boardList ?? []).map((board) => ({
            id: `boards:${org}:${board.id}`,
            title: board.name,
            subtitle: orgName,
            keywords: `board go ${org} ${orgName}`,
            icon: "board",
            ...(onOrgBoard(board.id) ? { current: "Current" } : {}),
            remember: true,
            run: ({ navigate }) => navigate(boardHref(org, board.id)),
          }))

    const repositories: Array<PaletteItem> = []
    if (org !== undefined) {
      const active = (repos.data ?? []).filter((repo) => !repo.archived)
      if (forgejoUrl !== undefined) {
        for (const repo of active) {
          repositories.push({
            id: `repo:forgejo:${repo.fullName}`,
            title: repo.name,
            subtitle: "Open in Forgejo",
            keywords: `forgejo repository open ${org} ${orgName}`,
            icon: "external",
            external: true,
            remember: true,
            run: () => openExternal(`${forgejoUrl}/${repo.fullName}`),
          })
        }
      }
    }

    // The board's own cards, matched with no request; an issue that is also your work or a
    // search result shows once, as its card.
    const cards: ReadonlyArray<PaletteItem> =
      boardData === undefined || cardHref === undefined
        ? []
        : boardData.cards.map((card) => {
            const column = boardData.columns.find(({ key }) => key === card.column)
            const href = cardHref(card)
            return {
              id: `card:${card.key}`,
              title: card.title,
              subtitle: `${card.repo}#${card.number}`,
              ...issueNames(card.key.slice(0, card.key.lastIndexOf("#")), card.number),
              icon: "issue",
              kind: { type: "issue", state: card.state },
              ...(column === undefined ? {} : { hint: column.title }),
              enterLabel: "Open on the board",
              alternate: { label: "Open in Forgejo", run: () => openExternal(card.url) },
              remember: true,
              run: ({ navigate }) => navigate(href),
            }
          })

    const work: Array<PaletteItem> = []
    const seen = new Set<string>()
    for (const { key, label } of WORK_SECTIONS) {
      const section = dashboardData?.[key]
      if (section?._tag !== "Loaded") continue
      for (const item of section.items) {
        if (seen.has(item.url)) continue
        seen.add(item.url)
        work.push(
          issueItem(item, `work:${item.url}`, issueBoardHref, {
            keywords: label,
            hint: label,
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
      ...(preference === currentTheme ? { current: "Current" } : {}),
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
      // A touch screen has no keys to list, as in the board's options menu.
      ...(window.matchMedia("(pointer: coarse)").matches
        ? []
        : [
            {
              id: "action:shortcuts",
              title: "Show keyboard shortcuts",
              keywords: "help keys hotkeys",
              icon: "keyboard",
              keys: shortcutKeys("shortcuts", isMac),
              remember: true,
              run: ({ openShortcuts }) => openShortcuts(),
            } satisfies PaletteItem,
          ]),
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
      issueItem(item, `issue:${item.url}`, issueBoardHref, { remember: false }),
    )

    return [
      ...pageGroups,
      // Before "Your work", so that an issue in both shows as its card.
      { id: "cards", heading: "Cards", items: cards, limit: 6, emptyLimit: 0, filter: true },
      {
        id: "navigation",
        heading: "Navigation",
        items: navigation,
        limit: 8,
        emptyLimit: 1 + ORG_VIEWS.length,
        filter: true,
      },
      {
        id: "boards",
        heading: orgName === undefined ? "Boards" : `Boards in ${orgName}`,
        items: boardItems,
        limit: 6,
        emptyLimit: 0,
        filter: true,
      },
      { id: "work", heading: "Your work", items: work, limit: 5, emptyLimit: 4, filter: true },
      {
        id: "repositories",
        heading: orgName === undefined ? "Repositories" : `Repositories in ${orgName}`,
        items: repositories,
        limit: 6,
        emptyLimit: 5,
        filter: true,
      },
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
  }, [
    lastScope,
    orgList,
    org,
    boardList,
    viewOrg,
    boardId,
    repos.data,
    forgejoUrl,
    dashboardData,
    searchItems,
    currentTheme,
    issueBoardHref,
    boardData,
    cardHref,
    pageGroups,
  ])

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
    retrySearch: () => void search.refetch(),
    minSearchLength: MIN_SEARCH_LENGTH,
  }
}
