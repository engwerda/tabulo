import type { Dashboard, DashboardItem, NotificationItem } from "../shared/api.ts"
import type { PanelIssue } from "./issue/panel-issue.ts"

/** The address parameter that names the previewed issue as `owner/repo#12`, percent-encoded. */
export const PREVIEW_PARAM = "item"

/** The dashboard's item sections in page order. */
export const ITEM_SECTIONS = ["reviewRequests", "assigned", "mentioned", "created"] as const
export type ItemSection = (typeof ITEM_SECTIONS)[number]

/**
 * What the dashboard's preview shows: the issue, the dashboard item that lists it, and the user's
 * unread notification about it.
 */
export type Preview = {
  /** `owner/repo#number`, as the rows and the address write it. */
  readonly ref: string
  readonly issue: PanelIssue
  /**
   * The item from the first item section that lists it, for its labels, author, and update time;
   * null for an issue that only a notification names.
   */
  readonly item: DashboardItem | null
  /** The unread notification about this issue, if the notifications section lists one. */
  readonly notification: NotificationItem | null
}

/** `owner/repo#number` of a dashboard item. */
export const itemRef = (item: DashboardItem) => `${item.repo}#${item.number}`

/** A notification names no number, but an issue's or pull request's address ends in one. */
export const numberIn = (url: string) => {
  const match = /\/(?:issues|pulls)\/(\d+)(?:[/?#]|$)/.exec(url)
  return match?.[1] === undefined ? null : Number(match[1])
}

/** The notification subjects a preview can show: Forgejo's issues and pull requests. */
const PREVIEWABLE: Partial<Record<string, PanelIssue["kind"]>> = { Issue: "issue", Pull: "pull" }

type NotificationTarget = {
  readonly notification: NotificationItem
  readonly ref: string
  readonly kind: PanelIssue["kind"]
  readonly number: number
}

const notificationTarget = (notification: NotificationItem): NotificationTarget | null => {
  const kind = PREVIEWABLE[notification.subjectType]
  const number = numberIn(notification.url)
  if (kind === undefined || number === null) return null
  return { notification, ref: `${notification.repo}#${number}`, kind, number }
}

/**
 * The issue or pull request a notification is about, or null for a commit, a repository, or an
 * address without a number.
 */
export const notificationRef = (notification: NotificationItem) =>
  notificationTarget(notification)?.ref ?? null

const panelIssue = (
  repo: string,
  number: number,
  rest: Pick<PanelIssue, "kind" | "title" | "url" | "closed">,
): PanelIssue => {
  const slash = repo.indexOf("/")
  return {
    key: `${repo}#${number}`.toLowerCase(),
    owner: repo.slice(0, slash),
    repo: repo.slice(slash + 1),
    number,
    ...rest,
  }
}

/**
 * The preview of `ref` from the loaded sections, matching without regard to case as Forgejo's
 * names do; undefined when no loaded section lists it.
 */
export const findPreview = (data: Dashboard, ref: string): Preview | undefined => {
  const wanted = ref.toLowerCase()
  const item = ITEM_SECTIONS.flatMap((key) => {
    const section = data[key]
    return section._tag === "Loaded" ? section.items : []
  }).find((candidate) => itemRef(candidate).toLowerCase() === wanted)
  const notifications = data.notifications._tag === "Loaded" ? data.notifications.items : []
  const about =
    notifications.map(notificationTarget).find((target) => target?.ref.toLowerCase() === wanted) ??
    null
  if (item !== undefined) {
    return {
      ref: itemRef(item),
      issue: panelIssue(item.repo, item.number, {
        kind: item.kind,
        title: item.title,
        url: item.url,
        closed: item.state === "closed",
      }),
      item,
      notification: about?.notification ?? null,
    }
  }
  if (about === null) return undefined
  return {
    ref: about.ref,
    issue: panelIssue(about.notification.repo, about.number, {
      kind: about.kind,
      title: about.notification.title,
      url: about.notification.url,
      closed: false,
    }),
    item: null,
    notification: about.notification,
  }
}

/**
 * What the preview says about its notification: `unread` while the dashboard lists an update the
 * viewer has not marked read here, `marked` once they have, and null without a notification. A
 * later update of the same thread is unread again.
 */
export const notificationState = (
  listed: NotificationItem | null,
  marked: NotificationItem | null,
): "unread" | "marked" | null => {
  if (listed !== null && (listed.id !== marked?.id || listed.updatedAt !== marked.updatedAt)) {
    return "unread"
  }
  return marked === null ? null : "marked"
}

/** Where a preview was opened from: a section, by its element id, and the row's place in it. */
export type PreviewOrigin = { readonly section: string; readonly index: number }

/** A section of the page as focus sees it: the preview reference of each row link, in order. */
export type SectionRows = {
  readonly section: string
  /** Null for a row whose link opens Forgejo rather than a preview. */
  readonly refs: ReadonlyArray<string | null>
}

/** A row link to focus, by its place in its section, or the section's heading. */
export type FocusTarget =
  | { readonly section: string; readonly row: number }
  | { readonly section: string; readonly row: "heading" }

/**
 * Where focus goes when the preview of `ref` closes: the issue's row in the section it was opened
 * from, else its first row on the page, else the row now in the opener's place, else that
 * section's heading. A preview that no row opened, such as one restored by a reload, counts as
 * opened from the first row of `fallback`, the section that Mark read takes rows from. `sections`
 * come in page order; null when the section to fall back on is not on the page.
 */
export const focusAfterPreview = (
  sections: ReadonlyArray<SectionRows>,
  ref: string,
  origin: PreviewOrigin | null,
  fallback: string,
): FocusTarget | null => {
  const wanted = ref.toLowerCase()
  const isIssue = (row: string | null) => row?.toLowerCase() === wanted
  const home = sections.find((rows) => rows.section === (origin?.section ?? fallback))
  if (home !== undefined && origin !== null && isIssue(home.refs[origin.index] ?? null)) {
    return { section: home.section, row: origin.index }
  }
  for (const rows of home === undefined ? sections : [home, ...sections]) {
    const row = rows.refs.findIndex(isIssue)
    if (row !== -1) return { section: rows.section, row }
  }
  if (home === undefined) return null
  if (home.refs.length === 0) return { section: home.section, row: "heading" }
  return {
    section: home.section,
    row: Math.min(Math.max(origin?.index ?? 0, 0), home.refs.length - 1),
  }
}

/** The dashboard without the notification `id`, as Forgejo lists it once it is read. */
export const withoutNotification = (data: Dashboard, id: number): Dashboard => {
  const section = data.notifications
  if (section._tag !== "Loaded") return data
  const items = section.items.filter((notification) => notification.id !== id)
  if (items.length === section.items.length) return data
  return { ...data, notifications: { _tag: "Loaded", items, total: section.total - 1 } }
}
