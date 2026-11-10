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
  labels: Schema.Array(
    Schema.Struct({ id: Schema.Number, name: Schema.String, color: Schema.String }),
  ),
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

/** A user where Forgejo names one beside other data: a poster, an assignee, an author. */
export const ForgejoPerson = Schema.Struct({ login: Schema.String, avatar_url: Schema.String })
export type ForgejoPerson = typeof ForgejoPerson.Type

/** A milestone as an issue names it. */
export const ForgejoMilestoneRef = Schema.Struct({ id: Schema.Number, title: Schema.String })
export type ForgejoMilestoneRef = typeof ForgejoMilestoneRef.Type

/** A milestone as the repository's milestone listing returns it. */
export const ForgejoMilestone = Schema.Struct({
  ...ForgejoMilestoneRef.fields,
  open_issues: Schema.Number,
  closed_issues: Schema.Number,
  due_on: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type ForgejoMilestone = typeof ForgejoMilestone.Type

/** An issue as the repository issue endpoints return it. */
export const ForgejoRepoIssue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  html_url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  labels: Schema.Array(ForgejoLabel),
  assignees: Schema.NullOr(Schema.Array(ForgejoPerson)),
  milestone: Schema.NullOr(ForgejoMilestoneRef),
  user: ForgejoPerson,
  comments: Schema.Number,
  created_at: Schema.String,
  updated_at: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  pull_request: Schema.optionalKey(Schema.NullOr(Schema.Struct({}))),
  repository: Schema.Struct({ full_name: Schema.String }),
})
export type ForgejoRepoIssue = typeof ForgejoRepoIssue.Type

export const ForgejoEpicIssue = Schema.Struct({
  ...ForgejoRepoIssue.fields,
  body: Schema.NullOr(Schema.String),
})
export type ForgejoEpicIssue = typeof ForgejoEpicIssue.Type

/**
 * An issue as a timeline's reference event carries it, loaded when the timeline is read, so its
 * description, state, and labels are current. `repository` resolves the references in its
 * description.
 */
export const ForgejoReferringIssue = Schema.Struct({
  ...ForgejoEpicIssue.fields,
  repository: Schema.Struct({
    owner: Schema.String,
    name: Schema.String,
    full_name: Schema.String,
  }),
  pull_request: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        merged: Schema.optionalKey(Schema.Boolean),
        draft: Schema.optionalKey(Schema.Boolean),
      }),
    ),
  ),
})
export type ForgejoReferringIssue = typeof ForgejoReferringIssue.Type

/** One event of an issue's timeline. Only reference events carry `ref_issue`. */
export const ForgejoTimelineEvent = Schema.Struct({
  type: Schema.String,
  /**
   * How a reference refers to the issue: "closes" with a closing keyword, "reopens", "none",
   * or "neutered" once an edit removed the reference.
   */
  ref_action: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ref_issue: Schema.optionalKey(Schema.NullOr(ForgejoReferringIssue)),
})

/** The description of an issue, which only a card's detail reads. */
export const ForgejoIssueBody = Schema.Struct({ body: Schema.String })

export const ForgejoComment = Schema.Struct({
  id: Schema.Number,
  user: ForgejoPerson,
  body: Schema.String,
  created_at: Schema.String,
})
export type ForgejoComment = typeof ForgejoComment.Type

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

/** Contributions in one 15-minute slot starting at `timestamp`, in Unix seconds. */
export const ForgejoHeatmapEntry = Schema.Struct({
  timestamp: Schema.Number,
  contributions: Schema.Number,
})
export type ForgejoHeatmapEntry = typeof ForgejoHeatmapEntry.Type
