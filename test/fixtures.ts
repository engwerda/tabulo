// Forgejo API payloads in the shape Forgejo 17 returns, including fields Tabulo ignores.

import type { FakeIssue, FakeLabel, FakeOrg, FakeRepo } from "./fake-forgejo.ts"

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

// Board fixtures: an organization with status labels, two repositories, and their issues.

const label = (id: number, name: string, color: string, exclusive: boolean): FakeLabel => ({
  id,
  name,
  color,
  exclusive,
  description: "",
  url: `https://forgejo.example/api/v1/orgs/acme/labels/${id}`,
  is_archived: false,
})

/** A repository-level label of `acme/<repo>`, which Forgejo serves beside the org's labels. */
export const repoLabel = (
  repo: string,
  id: number,
  name: string,
  color: string,
  exclusive: boolean,
): FakeLabel => ({
  ...label(id, name, color, exclusive),
  url: `https://forgejo.example/api/v1/repos/acme/${repo}/labels/${id}`,
})

export const backlog = label(10, "Status/Backlog", "c5def5", true)
export const inProgress = label(11, "Status/In Progress", "fbca04", true)
export const review = label(12, "Status/Review", "5319e7", true)
export const bug = label(20, "Kind/Bug", "d73a4a", false)
export const highPriority = label(21, "Priority/High", "b60205", true)
export const retired = { ...label(13, "Status/Retired", "cccccc", true), is_archived: true }

export const grace = {
  id: 9,
  login: "grace",
  full_name: "Grace Hopper",
  avatar_url: "https://forgejo.example/avatars/grace",
}

/** Can sign in to Forgejo but is not a member of acme. */
export const outsider = {
  id: 11,
  login: "linus",
  full_name: "Linus Outsider",
  avatar_url: "https://forgejo.example/avatars/linus",
}

export const boardIssue = (
  repo: string,
  number: number,
  fields: Partial<FakeIssue> = {},
): FakeIssue => ({
  id: 1000 + number,
  number,
  title: `Issue ${number} in ${repo}`,
  html_url: `https://forgejo.example/acme/${repo}/issues/${number}`,
  state: "open",
  labels: [],
  user: { id: 7, login: "ada" },
  assignees: null,
  milestone: null,
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-11-01T08:00:00Z",
  closed_at: null,
  comments: 0,
  pull_request: null,
  repository: { id: 100, name: repo, owner: "acme", full_name: `acme/${repo}` },
  body: "",
  is_locked: false,
  ...fields,
})

export const boardRepo = (name: string, fields: Partial<FakeRepo> = {}): FakeRepo => ({
  name,
  private: true,
  archived: false,
  writers: ["ada"],
  triagers: [],
  labels: [],
  issues: [],
  failIssueListing: false,
  ...fields,
})

export const acme = (repos: Array<FakeRepo>): FakeOrg => ({
  name: "acme",
  full_name: "Acme Corporation",
  avatar_url: "https://forgejo.example/avatars/acme",
  members: ["ada", "grace"],
  labels: [review, bug, backlog, inProgress, highPriority],
  repos,
})
