import { Effect } from "effect"
import type { Dashboard, DashboardItem, NotificationItem, Section } from "../shared/api.ts"
import { describeForgejoError, type ForgejoError, type ForgejoUnauthorized } from "./errors.ts"
import { type AccessToken, ForgejoClient, type Page } from "./forgejo/client.ts"
import type { ForgejoIssue, ForgejoNotification } from "./forgejo/schemas.ts"

const SECTION_LIMIT = 30
const FORGEJO_CONCURRENCY = 3

export const toDashboardItem = (issue: ForgejoIssue): DashboardItem => ({
  kind: issue.pull_request == null ? "issue" : "pull",
  repo: issue.repository.full_name,
  number: issue.number,
  title: issue.title,
  url: issue.html_url,
  state: issue.state,
  labels: issue.labels.map(({ name, color }) => ({
    name,
    color: color.startsWith("#") ? color : `#${color}`,
  })),
  author: issue.user.login,
  updatedAt: issue.updated_at,
  comments: issue.comments,
})

export const toNotificationItem = (notification: ForgejoNotification): NotificationItem => ({
  id: notification.id,
  title: notification.subject.title,
  subjectType: notification.subject.type,
  repo: notification.repository.full_name,
  url: notification.subject.html_url,
  updatedAt: notification.updated_at,
})

/** A failed read becomes a `Failed` section; only an auth failure escapes. */
const section = <A, B>(
  name: string,
  read: Effect.Effect<Page<A>, ForgejoError>,
  toItem: (item: A) => B,
): Effect.Effect<Section<B>, ForgejoUnauthorized> =>
  read.pipe(
    Effect.map(
      ({ items, total }): Section<B> => ({
        _tag: "Loaded",
        items: items.map(toItem),
        total,
      }),
    ),
    Effect.catchTag(
      ["ForgejoRequestFailed", "ForgejoUnreachable", "ForgejoDecodeFailed"],
      (error) =>
        Effect.sync((): Section<B> => {
          console.warn(`Dashboard section ${name} failed`, error)
          return { _tag: "Failed", message: describeForgejoError(error) }
        }),
    ),
  )

/** Reads every dashboard section as the user who owns `token`. */
export const loadDashboardSections = (
  token: AccessToken,
): Effect.Effect<Omit<Dashboard, "user">, ForgejoUnauthorized, ForgejoClient> =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const search = (name: Parameters<typeof forgejo.searchIssues>[1]) =>
      section(name, forgejo.searchIssues(token, name, SECTION_LIMIT), toDashboardItem)
    return yield* Effect.all(
      {
        reviewRequests: search("review_requested"),
        assigned: search("assigned"),
        mentioned: search("mentioned"),
        created: search("created"),
        notifications: section(
          "notifications",
          forgejo.unreadNotifications(token, SECTION_LIMIT),
          toNotificationItem,
        ),
      },
      { concurrency: FORGEJO_CONCURRENCY },
    )
  })
