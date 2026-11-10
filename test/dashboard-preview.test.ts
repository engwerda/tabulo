import { describe, expect, it } from "vitest"
import {
  findPreview,
  type ItemSection,
  itemRef,
  notificationRef,
  withoutNotification,
} from "../src/client/dashboard-preview.ts"
import type { Dashboard, DashboardItem, NotificationItem, Section } from "../src/shared/api.ts"

const item = (
  repo: string,
  number: number,
  fields: Partial<DashboardItem> = {},
): DashboardItem => ({
  kind: "issue",
  repo,
  number,
  title: `Issue ${number}`,
  url: `https://forgejo.example/${repo}/issues/${number}`,
  state: "open",
  labels: [],
  author: "grace",
  updatedAt: "2026-11-06T10:00:00Z",
  comments: 0,
  ...fields,
})

const notification = (
  id: number,
  subjectType: string,
  repo: string,
  url: string,
  title = `Notification ${id}`,
): NotificationItem => ({ id, title, subjectType, repo, url, updatedAt: "2026-11-07T08:00:00Z" })

const loaded = <A>(items: ReadonlyArray<A>): Section<A> => ({
  _tag: "Loaded",
  items,
  total: items.length,
})

const failed = { _tag: "Failed", message: "Forgejo had a problem (HTTP 500)" } as const

const dashboard = (sections: Partial<Omit<Dashboard, "user">> = {}): Dashboard => ({
  user: { id: 7, login: "ada", name: "Ada Lovelace", avatarUrl: "https://forgejo.example/a" },
  reviewRequests: loaded([]),
  assigned: loaded([]),
  mentioned: loaded([]),
  created: loaded([]),
  notifications: loaded([]),
  ...sections,
})

describe("itemRef", () => {
  it("writes an item's reference as owner/repo#number", () => {
    expect(itemRef(item("acme/web", 8))).toBe("acme/web#8")
  })
})

describe("notificationRef", () => {
  it.each([
    ["Issue", "https://forgejo.example/acme/web/issues/12", "acme/web#12"],
    ["Pull", "https://forgejo.example/acme/web/pulls/3#issuecomment-9", "acme/web#3"],
  ])("names the issue or pull request of a %s notification", (subjectType, url, ref) => {
    expect(notificationRef(notification(1, subjectType, "acme/web", url))).toBe(ref)
  })

  it.each([
    ["a commit", "Commit", "https://forgejo.example/acme/web/issues/12"],
    ["a repository", "Repository", "https://forgejo.example/acme/web/pulls/3"],
    ["an issue address without a number", "Issue", "https://forgejo.example/acme/web/issues"],
    ["an empty address", "Pull", ""],
  ])("names nothing for %s", (_, subjectType, url) => {
    expect(notificationRef(notification(1, subjectType, "acme/web", url))).toBeNull()
  })
})

describe("findPreview", () => {
  it("finds an item in any section, matching the reference without regard to case", () => {
    const found = item("acme/web", 8, { title: "Document the release process" })
    const preview = findPreview(dashboard({ created: loaded([found]) }), "ACME/Web#8")

    expect(preview).toEqual({
      ref: "acme/web#8",
      issue: {
        key: "acme/web#8",
        owner: "acme",
        repo: "web",
        number: 8,
        kind: "issue",
        title: "Document the release process",
        url: "https://forgejo.example/acme/web/issues/8",
        closed: false,
      },
      item: found,
      notification: null,
    })
  })

  it("previews a pull request item as a pull request and a closed item as closed", () => {
    const pull = item("acme/api", 42, {
      kind: "pull",
      state: "closed",
      url: "https://forgejo.example/acme/api/pulls/42",
    })
    const preview = findPreview(dashboard({ mentioned: loaded([pull]) }), "acme/api#42")

    expect(preview?.issue).toMatchObject({ kind: "pull", closed: true, url: pull.url })
  })

  it.each<[ItemSection, ItemSection]>([
    ["reviewRequests", "assigned"],
    ["assigned", "mentioned"],
    ["mentioned", "created"],
  ])("takes the item from %s over %s, as the page orders them", (first, second) => {
    const earlier = item("acme/web", 7, { title: "Earlier", author: "ada" })
    const later = item("acme/web", 7, { title: "Later", author: "grace" })
    const data = dashboard({ [second]: loaded([later]), [first]: loaded([earlier]) })

    expect(findPreview(data, "acme/web#7")?.item).toBe(earlier)
    expect(findPreview(data, "acme/web#7")?.issue.title).toBe("Earlier")
  })

  it("attaches the unread notification about the same issue", () => {
    const pull = item("acme/api", 42, { kind: "pull" })
    const other = notification(54, "Pull", "acme/api", "https://forgejo.example/acme/api/pulls/41")
    const about = notification(55, "Pull", "Acme/API", "https://forgejo.example/Acme/API/pulls/42")
    const data = dashboard({
      reviewRequests: loaded([pull]),
      notifications: loaded([other, about]),
    })

    const preview = findPreview(data, "acme/api#42")

    expect(preview?.item).toBe(pull)
    expect(preview?.notification).toBe(about)
  })

  it.each([
    ["Issue", "issue", "https://forgejo.example/acme/web/issues/9"],
    ["Pull", "pull", "https://forgejo.example/acme/web/pulls/9"],
  ] as const)("builds a preview from a %s notification alone", (subjectType, kind, url) => {
    const alone = notification(56, subjectType, "acme/web", url, "Translate the sign-in page")

    expect(findPreview(dashboard({ notifications: loaded([alone]) }), "acme/web#9")).toEqual({
      ref: "acme/web#9",
      issue: {
        key: "acme/web#9",
        owner: "acme",
        repo: "web",
        number: 9,
        kind,
        title: "Translate the sign-in page",
        url,
        closed: false,
      },
      item: null,
      notification: alone,
    })
  })

  it("does not preview a commit or repository notification", () => {
    const data = dashboard({
      notifications: loaded([
        notification(57, "Commit", "acme/web", "https://forgejo.example/acme/web/issues/12"),
        notification(58, "Repository", "acme/web", "https://forgejo.example/acme/web/pulls/13"),
      ]),
    })

    expect(findPreview(data, "acme/web#12")).toBeUndefined()
    expect(findPreview(data, "acme/web#13")).toBeUndefined()
  })

  it("skips sections that failed to load", () => {
    const found = item("acme/web", 8)
    const data = dashboard({
      reviewRequests: failed,
      assigned: loaded([found]),
      mentioned: failed,
      notifications: failed,
    })

    expect(findPreview(data, "acme/web#8")).toMatchObject({ item: found, notification: null })
  })

  it("returns undefined for a reference no section lists", () => {
    const data = dashboard({
      assigned: loaded([item("acme/web", 8)]),
      notifications: loaded([
        notification(55, "Issue", "acme/web", "https://forgejo.example/acme/web/issues/9"),
      ]),
    })

    expect(findPreview(data, "acme/web#10")).toBeUndefined()
    expect(findPreview(data, "acme/api#8")).toBeUndefined()
    expect(findPreview(data, "acme/web")).toBeUndefined()
  })
})

describe("withoutNotification", () => {
  const read = notification(55, "Issue", "acme/web", "https://forgejo.example/acme/web/issues/9")
  const unread = notification(56, "Pull", "acme/api", "https://forgejo.example/acme/api/pulls/4")

  it("drops the notification and counts one fewer", () => {
    const data = dashboard({ notifications: { _tag: "Loaded", items: [read, unread], total: 31 } })

    expect(withoutNotification(data, 55).notifications).toEqual({
      _tag: "Loaded",
      items: [unread],
      total: 30,
    })
  })

  it("leaves the dashboard as it is when the notification is not listed", () => {
    const data = dashboard({ notifications: loaded([unread]) })

    expect(withoutNotification(data, 55)).toBe(data)
    expect(withoutNotification(dashboard({ notifications: failed }), 55).notifications).toBe(failed)
  })
})
