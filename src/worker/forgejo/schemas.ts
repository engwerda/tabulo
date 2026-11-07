import { Schema } from "effect"

// Forgejo wire shapes. Only the fields Tabulo reads are declared; decoding drops the rest.

export const ForgejoUser = Schema.Struct({
  id: Schema.Number,
  login: Schema.String,
  full_name: Schema.String,
  avatar_url: Schema.String,
})
export type ForgejoUser = typeof ForgejoUser.Type

export const ForgejoIssue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  html_url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  labels: Schema.Array(Schema.Struct({ name: Schema.String, color: Schema.String })),
  user: Schema.Struct({ login: Schema.String }),
  updated_at: Schema.String,
  comments: Schema.Number,
  repository: Schema.Struct({ full_name: Schema.String }),
  pull_request: Schema.optionalKey(Schema.NullOr(Schema.Struct({}))),
})
export type ForgejoIssue = typeof ForgejoIssue.Type

export const ForgejoNotification = Schema.Struct({
  id: Schema.Number,
  subject: Schema.Struct({
    title: Schema.String,
    type: Schema.String,
    html_url: Schema.String,
  }),
  repository: Schema.Struct({ full_name: Schema.String }),
  updated_at: Schema.String,
})
export type ForgejoNotification = typeof ForgejoNotification.Type

export const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Number,
})

export const OAuthErrorResponse = Schema.Struct({ error: Schema.String })

/** Forgejo sends label colors with or without the leading `#`. */
export const labelHexColor = (color: string) => (color.startsWith("#") ? color : `#${color}`)

export const ForgejoLabel = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  color: Schema.String,
  exclusive: Schema.Boolean,
  is_archived: Schema.optionalKey(Schema.Boolean),
})
export type ForgejoLabel = typeof ForgejoLabel.Type

/** An issue as the repository issue endpoints return it. */
export const ForgejoRepoIssue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  html_url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  labels: Schema.Array(ForgejoLabel),
  assignees: Schema.NullOr(
    Schema.Array(Schema.Struct({ login: Schema.String, avatar_url: Schema.String })),
  ),
  milestone: Schema.NullOr(Schema.Struct({ title: Schema.String })),
  updated_at: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  pull_request: Schema.optionalKey(Schema.NullOr(Schema.Struct({}))),
})
export type ForgejoRepoIssue = typeof ForgejoRepoIssue.Type

export const ForgejoOrg = Schema.Struct({
  name: Schema.String,
  full_name: Schema.String,
  avatar_url: Schema.String,
})
export type ForgejoOrg = typeof ForgejoOrg.Type

export const ForgejoRepo = Schema.Struct({
  name: Schema.String,
  full_name: Schema.String,
  private: Schema.Boolean,
  archived: Schema.Boolean,
})
export type ForgejoRepo = typeof ForgejoRepo.Type

// Insights and activity reads.

export const ForgejoInsightRepo = Schema.Struct({
  ...ForgejoRepo.fields,
  html_url: Schema.String,
  default_branch: Schema.String,
  updated_at: Schema.String,
})
export type ForgejoInsightRepo = typeof ForgejoInsightRepo.Type

/** An issue or pull request from a repository listing without a `type` filter. */
export const ForgejoInsightIssue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  html_url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  user: Schema.Struct({ login: Schema.String, avatar_url: Schema.String }),
  labels: Schema.Array(Schema.Struct({ name: Schema.String, color: Schema.String })),
  assignees: Schema.NullOr(
    Schema.Array(Schema.Struct({ login: Schema.String, avatar_url: Schema.String })),
  ),
  created_at: Schema.String,
  updated_at: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  pull_request: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        merged: Schema.Boolean,
        merged_at: Schema.NullOr(Schema.String),
        draft: Schema.Boolean,
      }),
    ),
  ),
})
export type ForgejoInsightIssue = typeof ForgejoInsightIssue.Type

/**
 * A workflow run as `/actions/runs` lists it. The jobs that `/actions/tasks` lists are not used:
 * Forgejo's log cleanup rewrites their `updated_at` days later, so they do not give durations.
 */
export const ForgejoActionRun = Schema.Struct({
  status: Schema.String,
  workflow_id: Schema.String,
  /** The branch, or a tag or pull request reference. */
  prettyref: Schema.String,
  html_url: Schema.String,
  created: Schema.String,
  started: Schema.NullOr(Schema.String),
  stopped: Schema.NullOr(Schema.String),
})
export type ForgejoActionRun = typeof ForgejoActionRun.Type

export const ForgejoActionRunPage = Schema.Struct({
  workflow_runs: Schema.Array(ForgejoActionRun),
  /** Runs across all pages. */
  total_count: Schema.optionalKey(Schema.Number),
})

/** Bytes of code per language. */
export const ForgejoLanguages = Schema.Record(Schema.String, Schema.Number)
export type ForgejoLanguages = typeof ForgejoLanguages.Type

export const ForgejoMilestone = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  open_issues: Schema.Number,
  closed_issues: Schema.Number,
  due_on: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type ForgejoMilestone = typeof ForgejoMilestone.Type

/** Contributions in one 15-minute slot starting at `timestamp`, in Unix seconds. */
export const ForgejoHeatmapEntry = Schema.Struct({
  timestamp: Schema.Number,
  contributions: Schema.Number,
})
export type ForgejoHeatmapEntry = typeof ForgejoHeatmapEntry.Type
