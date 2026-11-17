import type { Epic, EpicChild, Epics } from "../../shared/api.ts"
import { type PanelIssue, panelIssue } from "../issue/panel-issue.ts"
import type { MissNotice } from "../issue/preview.ts"
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

export type EpicIssue = Extract<EpicChild, { readonly _tag: "Issue" }>

/** `owner/repo#number` of an epic of the page's organization, as its title writes `?item=`. */
export const epicRef = (org: string, epic: Pick<Epic, "repo" | "number">) =>
  `${org}/${epic.repo}#${epic.number}`

/**
 * `owner/repo#number` of a child by Forgejo's current name of its repository. Its `key` is the
 * reference as the epic wrote it, which can name the repository before a rename.
 */
export const childRef = (child: Pick<EpicIssue, "repo" | "number">) =>
  `${child.repo}#${child.number}`

/** What the Epics page's preview shows: an epic or a child, and the epics that list it. */
export type EpicPreview = {
  readonly issue: PanelIssue
  readonly item:
    | { readonly _tag: "Epic"; readonly epic: Epic; readonly backlinksRead: boolean }
    | { readonly _tag: "Child"; readonly child: EpicIssue }
  /** The epics that list it as a child, in the response's order, without itself. */
  readonly parents: ReadonlyArray<Epic>
}

/**
 * The preview of `ref` among every epic of the response, whatever the filters show, matching
 * without regard to case. An epic wins over a child with the same reference.
 */
export const findEpicPreview = (data: Epics, ref: string): EpicPreview | undefined => {
  const wanted = ref.toLowerCase()
  const names = (issue: string) => issue.toLowerCase() === wanted
  const childOf = (epic: Epic) =>
    epic.children.find(
      (child): child is EpicIssue => child._tag === "Issue" && names(childRef(child)),
    )
  const epic = data.epics.find((candidate) => names(epicRef(data.org, candidate)))
  const parents = data.epics.filter(
    (candidate) => candidate !== epic && childOf(candidate) !== undefined,
  )
  if (epic !== undefined) {
    return {
      issue: panelIssue(`${data.org}/${epic.repo}`, epic.number, {
        kind: "issue",
        title: epic.title,
        url: epic.url,
        closed: epic.state === "closed",
      }),
      item: { _tag: "Epic", epic, backlinksRead: backlinksRead(data.incomplete, epic) },
      parents,
    }
  }
  const child = parents[0] === undefined ? undefined : childOf(parents[0])
  if (child === undefined) return undefined
  return {
    issue: panelIssue(child.repo, child.number, {
      kind: child.kind,
      title: child.title,
      url: child.url,
      closed: child.state === "closed",
    }),
    item: { _tag: "Child", child },
    parents,
  }
}

/**
 * The notice that closes a preview of `ref`, which these epics do not list, with its likeliest
 * reason; null while a repository failed to load, as the next read may list it.
 */
export const epicPreviewMiss = (data: Epics, ref: string): MissNotice | null => {
  if (data.failedRepos.length > 0) return null
  const { listings, children, backlinks } = data.incomplete
  const unavailable = data.epics.some((epic) =>
    epic.children.some(
      (child) => child._tag === "Unavailable" && child.ref.toLowerCase() === ref.toLowerCase(),
    ),
  )
  return {
    title: `${ref} is not among these epics`,
    detail: unavailable
      ? children === 0
        ? "It is not available to you, or not found in Forgejo."
        : "Tabulo did not look up every child, so it may have skipped this one, or it is not available to you."
      : listings.length > 0 || children > 0 || backlinks.length > 0
        ? "Tabulo read only part of these repositories, so it may be missing."
        : "It is not an epic or a child of one in the chosen repositories.",
  }
}

/**
 * The card a preview belongs to when no row opened it, among the epics the page shows in its
 * order: the epic's own card, else the first card that lists the item; null when none shows.
 */
export const epicPreviewHome = (preview: EpicPreview, shown: ReadonlyArray<Epic>) => {
  const own = preview.item._tag === "Epic" ? preview.item.epic.key : null
  if (own !== null && shown.some(({ key }) => key === own)) return own
  const parents = new Set(preview.parents.map(({ key }) => key))
  return shown.find(({ key }) => parents.has(key))?.key ?? null
}
