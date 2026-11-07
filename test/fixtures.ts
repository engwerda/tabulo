// Forgejo API payloads in the shape Forgejo 17 returns, including fields Tabulo ignores.

const repository = (owner: string, name: string) => ({
  id: 3,
  name,
  owner,
  full_name: `${owner}/${name}`,
})

export const reviewRequestPull = {
  id: 901,
  url: "https://forgejo.example/api/v1/repos/acme/api/issues/42",
  html_url: "https://forgejo.example/acme/api/pulls/42",
  number: 42,
  user: { id: 9, login: "grace", full_name: "Grace Hopper", avatar_url: "" },
  original_author: "",
  title: "Add rate limiting to the public API",
  body: "Closes #40",
  ref: "",
  labels: [
    { id: 1, name: "Status/In Review", color: "fbca04", exclusive: true, description: "" },
    { id: 2, name: "Kind/Feature", color: "#0e8a16", exclusive: false, description: "" },
  ],
  milestone: null,
  assignees: null,
  state: "open",
  is_locked: false,
  comments: 3,
  created_at: "2026-11-01T09:00:00Z",
  updated_at: "2026-11-06T16:30:00Z",
  closed_at: null,
  due_date: null,
  pull_request: { merged: false, merged_at: null, draft: false, html_url: "" },
  repository: repository("acme", "api"),
  pin_order: 0,
}

export const assignedIssue = {
  id: 902,
  html_url: "https://forgejo.example/acme/web/issues/7",
  number: 7,
  user: { id: 7, login: "ada", full_name: "Ada Lovelace", avatar_url: "" },
  title: "Dark mode flickers on load",
  body: "",
  labels: [],
  state: "open",
  comments: 0,
  created_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-11-05T11:15:00Z",
  pull_request: null,
  repository: repository("acme", "web"),
}

export const createdIssue = {
  ...assignedIssue,
  id: 903,
  html_url: "https://forgejo.example/acme/web/issues/8",
  number: 8,
  title: "Document the release process",
  updated_at: "2026-11-04T10:00:00Z",
}

export const unreadNotification = {
  id: 55,
  repository: repository("acme", "api"),
  subject: {
    title: "Add rate limiting to the public API",
    url: "https://forgejo.example/api/v1/repos/acme/api/issues/42",
    html_url: "https://forgejo.example/acme/api/pulls/42",
    latest_comment_url: "",
    type: "Pull",
    state: "open",
  },
  unread: true,
  pinned: false,
  updated_at: "2026-11-06T17:00:00Z",
  url: "https://forgejo.example/api/v1/notifications/threads/55",
}
