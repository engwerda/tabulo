import { DEFAULT_BOARD_ID } from "../../shared/api.ts"

/** The views that show one organization's repositories, in navigation order. */
export const ORG_VIEWS = [
  {
    id: "board",
    path: "/board",
    route: "/:org/:board?",
    label: "Board",
    /** A glyph name from `src/client/palette/icons.tsx`. */
    icon: "board",
    pickerHint: "A board shows the issues of its repositories in one organization.",
  },
  {
    id: "insights",
    path: "/insights",
    route: "/:org",
    label: "Insights",
    icon: "insights",
    pickerHint: "Insights chart the issue activity of repositories in one organization.",
  },
  {
    id: "epics",
    path: "/epics",
    route: "/:org",
    label: "Epics",
    icon: "epics",
    pickerHint: "Epics track the progress of large pieces of work in one organization.",
  },
] as const

export type OrgView = (typeof ORG_VIEWS)[number]
export type OrgViewId = OrgView["id"]

export type OrgViewParams = { readonly org: string; readonly board?: string | undefined }

export const orgView = (id: OrgViewId): OrgView => {
  const view = ORG_VIEWS.find((candidate) => candidate.id === id)
  if (view === undefined) throw new Error(`Unknown view ${id}`)
  return view
}

export const isOrgViewPath = (view: OrgView, path: string) =>
  path === view.path || path.startsWith(`${view.path}/`)

export const boardIdFromPath = (segment: string | undefined): string =>
  segment === undefined || segment === "" ? DEFAULT_BOARD_ID : segment.toLowerCase()

export const boardHref = (org: string, board: string, params?: URLSearchParams): string => {
  const id = board.toLowerCase()
  const path = `${orgView("board").path}/${encodeURIComponent(org)}${
    id === DEFAULT_BOARD_ID ? "" : `/${encodeURIComponent(id)}`
  }`
  const query = params?.toString() ?? ""
  return query === "" ? path : `${path}?${query}`
}

export const canonicalBoardHref = (
  org: string,
  segment: string | undefined,
  params: URLSearchParams,
): string | null => {
  const board = boardIdFromPath(segment)
  // `repos` chose the board's repositories before there were boards; the board drops it.
  if (segment === (board === DEFAULT_BOARD_ID ? undefined : board) && !params.has("repos")) {
    return null
  }
  const kept = new URLSearchParams(params)
  kept.delete("repos")
  return boardHref(org, board, kept)
}

export type OrgScope = {
  readonly org: string
  readonly repos?: ReadonlyArray<string>
  readonly board?: string
}

export const orgViewHref = (view: OrgViewId, scope?: OrgScope): string => {
  const { path } = orgView(view)
  if (scope === undefined) return path
  if (view === "board") return boardHref(scope.org, scope.board ?? DEFAULT_BOARD_ID)
  const repos = scope.repos ?? []
  const query = repos.length === 0 ? "" : `?${new URLSearchParams({ repos: repos.join(",") })}`
  return `${path}/${encodeURIComponent(scope.org)}${query}`
}
