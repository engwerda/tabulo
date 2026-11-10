import type { Dashboard, DashboardItem, NotificationItem } from "../shared/api.ts"
import type { PanelIssue } from "./issue/panel-issue.ts"

/** The address parameter that names the previewed issue, as `?item=owner/repo#12`. */
export const PREVIEW_PARAM = "item"

/** The dashboard's item sections in page order. */
export const ITEM_SECTIONS = ["reviewRequests", "assigned", "mentioned", "created"] as const
export type ItemSection = (typeof ITEM_SECTIONS)[number]

/** What the dashboard's preview shows: the issue, the dashboard item that lists it, and the user's unread notification about it. */
export type Preview = {
  /** `owner/repo#number`, as the rows and the address write it. */
  readonly ref: string
  readonly issue: PanelIssue
  /** The item from the first item section that lists it, for its labels, author, and update time; null for a notification-only issue. */
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

/** The issue or pull request a notification is about, or null for a commit, repository, or URL without a number. */
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

/** The preview of `ref` from the loaded sections, matching case-insensitively as Forgejo names are; undefined when no loaded section lists it. */
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
