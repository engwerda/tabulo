import { DEFAULT_BOARD_ID } from "../../shared/api.ts"

/** The views that show one organization's repositories, in navigation order. */
export const ORG_VIEWS = [
  {
    id: "board",
    path: "/board",
    /** The page's address after `path`, as a wouter pattern: the default board has no id. */
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

/** What a view's route can name; each page takes the parameters its route has. */
export type OrgViewParams = { readonly org: string; readonly board?: string | undefined }

export const orgView = (id: OrgViewId): OrgView => {
  const view = ORG_VIEWS.find((candidate) => candidate.id === id)
  if (view === undefined) throw new Error(`Unknown view ${id}`)
  return view
}

export const isOrgViewPath = (view: OrgView, path: string) =>
  path === view.path || path.startsWith(`${view.path}/`)

/** The board an address names: its id segment lowercased, the default board without one. */
export const boardIdFromPath = (segment: string | undefined): string =>
  segment === undefined || segment === "" ? DEFAULT_BOARD_ID : segment.toLowerCase()

/** `/board/<org>` for the default board, `/board/<org>/<id>` for another, then `params`. */
export const boardHref = (org: string, board: string, params?: URLSearchParams): string => {
  const id = board.toLowerCase()
  const path = `${orgView("board").path}/${encodeURIComponent(org)}${
    id === DEFAULT_BOARD_ID ? "" : `/${encodeURIComponent(id)}`
  }`
  const query = params?.toString() ?? ""
  return query === "" ? path : `${path}?${query}`
}

/** What a view's address keeps of an organization: its board, or its chosen repositories. */
export type OrgScope = {
  readonly org: string
  readonly repos?: ReadonlyArray<string>
  readonly board?: string
}

/**
 * The address of a view: its organization picker without a scope, the board of the scope, or the
 * organization's page with the chosen repositories, if any. Every link to a view comes from here,
 * so each opens the organization's last board.
 */
export const orgViewHref = (view: OrgViewId, scope?: OrgScope): string => {
  const { path } = orgView(view)
  if (scope === undefined) return path
  if (view === "board") return boardHref(scope.org, scope.board ?? DEFAULT_BOARD_ID)
  const repos = scope.repos ?? []
  const query = repos.length === 0 ? "" : `?${new URLSearchParams({ repos: repos.join(",") })}`
  return `${path}/${encodeURIComponent(scope.org)}${query}`
}
