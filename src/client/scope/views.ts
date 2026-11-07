/** The views that show one organization's repositories, in navigation order. */
export const ORG_VIEWS = [
  {
    id: "board",
    path: "/board",
    label: "Board",
    pickerHint: "A board shows the issues of repositories in one organization.",
  },
  {
    id: "insights",
    path: "/insights",
    label: "Insights",
    pickerHint: "Insights chart the issue activity of repositories in one organization.",
  },
  {
    id: "epics",
    path: "/epics",
    label: "Epics",
    pickerHint: "Epics track the progress of large pieces of work in one organization.",
  },
] as const

export type OrgView = (typeof ORG_VIEWS)[number]
export type OrgViewId = OrgView["id"]

export const orgView = (id: OrgViewId): OrgView => {
  const view = ORG_VIEWS.find((candidate) => candidate.id === id)
  if (view === undefined) throw new Error(`Unknown view ${id}`)
  return view
}

export const isOrgViewPath = (view: OrgView, path: string) =>
  path === view.path || path.startsWith(`${view.path}/`)

/**
 * The address of a view: its organization picker without `org`, else the organization's page
 * with the chosen repositories, if any.
 */
export const orgViewHref = (
  view: OrgViewId,
  org?: string,
  repos: ReadonlyArray<string> = [],
): string => {
  const { path } = orgView(view)
  if (org === undefined) return path
  const query = repos.length === 0 ? "" : `?${new URLSearchParams({ repos: repos.join(",") })}`
  return `${path}/${encodeURIComponent(org)}${query}`
}
