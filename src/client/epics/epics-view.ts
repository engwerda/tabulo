import type { Epic, Epics } from "../../shared/api.ts"
import { boardHref } from "../scope/views.ts"

/** A repository of the page's organization by its bare name, as the epic and the board name it. */
export const shortRepo = (org: string, repo: string) =>
  repo.toLowerCase().startsWith(`${org.toLowerCase()}/`) ? repo.slice(org.length + 1) : repo

/** A board as far as a link needs it: its id and the repositories it shows. */
export type LinkedBoard = { readonly id: string; readonly repos: ReadonlyArray<string> }

/**
 * The address that opens an open issue of the organization in `board`'s side panel, when that
 * board shows the issue's repository. A closed issue may have left the Done column and a pull
 * request is never a card, so neither has one. Without one the item links to Forgejo.
 */
export const boardCardHref = (
  org: string,
  board: LinkedBoard | undefined,
  issue: {
    readonly repo: string
    readonly number: number
    readonly state: "open" | "closed"
    readonly kind?: "issue" | "pull"
  },
): string | null => {
  const repo = shortRepo(org, issue.repo)
  if (issue.state !== "open" || issue.kind === "pull" || repo.includes("/")) return null
  if (!board?.repos.some((shown) => shown.toLowerCase() === repo.toLowerCase())) return null
  return boardHref(org, board.id, new URLSearchParams({ card: `${repo}#${issue.number}` }))
}

export const completion = ({ total, done }: Pick<Epic["progress"], "total" | "done">) =>
  total === 0 ? 0 : Math.round((done / total) * 100)

export const readEpicFilters = (params: URLSearchParams) => {
  const state = params.get("state")
  const sort = params.get("sort")
  return {
    text: params.get("q") ?? "",
    state: state === "open" || state === "closed" ? state : "",
    assignee: params.get("assignee") ?? "",
    sort: sort === "progress" || sort === "children" ? sort : "updated",
  }
}

/** The epics whose children show, kept in the address so Back brings them back. */
export const readOpenEpics = (params: URLSearchParams): ReadonlySet<string> =>
  new Set((params.get("open") ?? "").split(",").filter((key) => key !== ""))

export const withEpicOpen = (params: URLSearchParams, key: string, open: boolean) => {
  const keys = new Set(readOpenEpics(params))
  if (open) keys.add(key)
  else keys.delete(key)
  const next = new URLSearchParams(params)
  if (keys.size === 0) next.delete("open")
  else next.set("open", [...keys].join(","))
  return next
}

export const visibleEpics = (epics: ReadonlyArray<Epic>, params: URLSearchParams) => {
  const filters = readEpicFilters(params)
  const text = filters.text.trim().toLowerCase()
  return epics
    .filter(
      (epic) =>
        (filters.state === "" || epic.state === filters.state) &&
        (filters.assignee === "" ||
          epic.assignees.some(({ login }) => login === filters.assignee)) &&
        (text === "" ||
          epic.title.toLowerCase().includes(text) ||
          `${epic.repo}#${epic.number}`.toLowerCase().includes(text)),
    )
    .sort((a, b) => {
      const difference =
        filters.sort === "progress"
          ? (b.progress.total === 0 ? 0 : b.progress.done / b.progress.total) -
            (a.progress.total === 0 ? 0 : a.progress.done / a.progress.total)
          : filters.sort === "children"
            ? b.progress.total - a.progress.total
            : 0
      return difference || b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key)
    })
}

export const epicSummary = (epics: ReadonlyArray<Epic>) => {
  const total = epics.reduce((sum, epic) => sum + epic.progress.total, 0)
  const done = epics.reduce((sum, epic) => sum + epic.progress.done, 0)
  return {
    total,
    done,
    percent: completion({ total, done }),
    atRisk: epics.filter(
      (epic) => epic.state === "open" && epic.progress.total > 0 && epic.progress.done === 0,
    ).length,
  }
}

const LISTING_LABELS = { open: "open issues", closed: "recently closed issues" } as const
const NAMED_EPICS = 5

/**
 * What Tabulo did not read, as sentences; empty when it read everything. The epics whose linking
 * issues it did not read are named up to five.
 */
export const incompleteNotice = ({ listings, children, backlinks }: Epics["incomplete"]) => {
  const lookups =
    children === 1
      ? "did not look up 1 child, which shows as unavailable."
      : `did not look up ${children} children, which show as unavailable.`
  const limit = "Tabulo reached its limit of Forgejo requests and"
  const partly =
    listings.length === 0
      ? ""
      : `${limit} read only part of the ${listings
          .map(({ repo, listing }) => `${LISTING_LABELS[listing]} of ${repo}`)
          .join(", ")}, so some epics may be missing.`
  const unlooked = children === 0 ? "" : partly === "" ? `${limit} ${lookups}` : `It ${lookups}`
  const others = backlinks.length - NAMED_EPICS
  const named = `${backlinks
    .slice(0, NAMED_EPICS)
    .map(({ repo, number }) => `${repo}#${number}`)
    .join(", ")}${others > 0 ? ` and ${others} other ${others === 1 ? "epic" : "epics"}` : ""}`
  const unlinked =
    backlinks.length === 0
      ? ""
      : `Tabulo did not read every issue that links to ${named}, so some of ${
          backlinks.length === 1 ? "its" : "their"
        } children may be missing.`
  return [partly, unlooked, unlinked].filter((sentence) => sentence !== "").join(" ")
}

export const backlinksRead = (
  incomplete: Epics["incomplete"],
  epic: Pick<Epic, "repo" | "number">,
) => !incomplete.backlinks.some(({ repo, number }) => repo === epic.repo && number === epic.number)
