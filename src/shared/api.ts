import { Schema } from "effect"

export const Label = Schema.Struct({ name: Schema.String, color: Schema.String })

export const DashboardItem = Schema.Struct({
  kind: Schema.Literals(["issue", "pull"]),
  repo: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  labels: Schema.Array(Label),
  author: Schema.String,
  updatedAt: Schema.String,
  comments: Schema.Number,
})
export type DashboardItem = typeof DashboardItem.Type

export const NotificationItem = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  subjectType: Schema.String,
  repo: Schema.String,
  url: Schema.String,
  updatedAt: Schema.String,
})
export type NotificationItem = typeof NotificationItem.Type

export const Section = <S extends Schema.Top>(item: S) =>
  Schema.Union([
    Schema.TaggedStruct("Loaded", { items: Schema.Array(item), total: Schema.Number }),
    Schema.TaggedStruct("Failed", { message: Schema.String }),
  ])

export type Section<A> =
  | { readonly _tag: "Loaded"; readonly items: ReadonlyArray<A>; readonly total: number }
  | { readonly _tag: "Failed"; readonly message: string }

export const User = Schema.Struct({
  login: Schema.String,
  name: Schema.String,
  avatarUrl: Schema.String,
})
export type User = typeof User.Type

export const Dashboard = Schema.Struct({
  user: User,
  reviewRequests: Section(DashboardItem),
  assigned: Section(DashboardItem),
  mentioned: Section(DashboardItem),
  created: Section(DashboardItem),
  notifications: Section(NotificationItem),
})
export type Dashboard = typeof Dashboard.Type

export const Org = Schema.Struct({
  name: Schema.String,
  fullName: Schema.String,
  avatarUrl: Schema.String,
})
export type Org = typeof Org.Type

export const OrgRepo = Schema.Struct({
  name: Schema.String,
  fullName: Schema.String,
  private: Schema.Boolean,
  archived: Schema.Boolean,
})
export type OrgRepo = typeof OrgRepo.Type

export const BoardLabel = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  color: Schema.String,
})
export type BoardLabel = typeof BoardLabel.Type

/**
 * Todo holds open issues without a status label, a Status column the open issues with its
 * label, and Done the issues closed within the configured window.
 */
export const BoardColumn = Schema.Union([
  Schema.TaggedStruct("Todo", { key: Schema.Literal("todo"), title: Schema.Literal("Todo") }),
  Schema.TaggedStruct("Status", {
    /** The label's full name. */
    key: Schema.String,
    /** The label's name without the status scope. */
    title: Schema.String,
    label: BoardLabel,
  }),
  Schema.TaggedStruct("Done", { key: Schema.Literal("done"), title: Schema.Literal("Done") }),
])
export type BoardColumn = typeof BoardColumn.Type

export const BoardCard = Schema.Struct({
  /** `owner/repo#number`. */
  key: Schema.String,
  /** The repository name, without the organization. */
  repo: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  /** Every label except status labels. */
  labels: Schema.Array(BoardLabel),
  assignees: Schema.Array(Schema.Struct({ login: Schema.String, avatarUrl: Schema.String })),
  milestone: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  closedAt: Schema.NullOr(Schema.String),
  /** The key of the column the card is in. */
  column: Schema.String,
  /** Position within the column; sort with compareCardOrder in card-order.ts. */
  rank: Schema.String,
  /** Why nobody can move the card, whoever is viewing; null when it can be moved. */
  readOnlyReason: Schema.NullOr(Schema.Literal("archived")),
})
export type BoardCard = typeof BoardCard.Type

export const Board = Schema.Struct({
  org: Schema.String,
  repos: Schema.Array(Schema.String),
  /**
   * Whether the viewer may move and reorder cards: card order is Tabulo's data, so only
   * members of the organization arrange it. Forgejo still decides each issue write.
   */
  viewerCanArrange: Schema.Boolean,
  columns: Schema.Array(BoardColumn),
  cards: Schema.Array(BoardCard),
  failedRepos: Schema.Array(Schema.Struct({ repo: Schema.String, message: Schema.String })),
})
export type Board = typeof Board.Type

export const MoveCardRequest = Schema.Struct({
  org: Schema.String,
  repo: Schema.String,
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  /** The column the client showed the card in; a mismatch with Forgejo answers 409. */
  fromColumn: Schema.String,
  toColumn: Schema.String,
  /** The key of the card shown directly above the drop, or null at the top of the column. */
  afterKey: Schema.NullOr(Schema.String),
  /** The key of the card shown directly below the drop, or null at the bottom. */
  beforeKey: Schema.NullOr(Schema.String),
})
export type MoveCardRequest = typeof MoveCardRequest.Type

export const MoveCardResult = Schema.Struct({
  card: BoardCard,
  /** False when Forgejo applied the move but Tabulo could not store the card's rank. */
  orderSaved: Schema.Boolean,
})
export type MoveCardResult = typeof MoveCardResult.Type

// Insights and activity.

export const INSIGHT_DAYS = [30, 90, 180, 365] as const
export type InsightDays = (typeof INSIGHT_DAYS)[number]

/** A count in the window and the same count in the window before it. */
export const Tile = Schema.Struct({ value: Schema.Number, previous: Schema.Number })
export type Tile = typeof Tile.Type

/** A measure that is null when the window has nothing to measure, such as no merged pulls. */
export const OptionalTile = Schema.Struct({
  value: Schema.NullOr(Schema.Number),
  previous: Schema.NullOr(Schema.Number),
})
export type OptionalTile = typeof OptionalTile.Type

export const Bucket = Schema.Struct({ label: Schema.String, count: Schema.Number })
export type Bucket = typeof Bucket.Type

export const InsightWeek = Schema.Struct({
  /** The Monday that starts the week, `YYYY-MM-DD` in the request's time zone. */
  weekStart: Schema.String,
  issuesOpened: Schema.Number,
  issuesClosed: Schema.Number,
  pullsOpened: Schema.Number,
  pullsMerged: Schema.Number,
  /** Open issues at the end of the week, or now for the current week. */
  openIssues: Schema.Number,
})
export type InsightWeek = typeof InsightWeek.Type

export const Language = Schema.Struct({ name: Schema.String, bytes: Schema.Number })
export type Language = typeof Language.Type

export const CiWeek = Schema.Struct({
  weekStart: Schema.String,
  success: Schema.Number,
  failure: Schema.Number,
  /** Cancelled, skipped, and unfinished runs. */
  other: Schema.Number,
})
export type CiWeek = typeof CiWeek.Type

export const CiSummary = Schema.Struct({
  /** Workflow runs created in the window. */
  runs: Schema.Number,
  /** Passed runs among the runs that passed or failed. */
  successRate: Schema.NullOr(Schema.Number),
  medianDurationMinutes: Schema.NullOr(Schema.Number),
  weekly: Schema.Array(CiWeek),
  slowestWorkflows: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      repo: Schema.String,
      medianDurationMinutes: Schema.Number,
      runs: Schema.Number,
    }),
  ),
})
export type CiSummary = typeof CiSummary.Type

export const AttentionKind = Schema.Literals([
  "failing_ci",
  "overdue_milestone",
  "stale_pull",
  "stale_issue",
])
export type AttentionKind = typeof AttentionKind.Type

export const AttentionItem = Schema.Struct({
  kind: AttentionKind,
  repo: Schema.String,
  title: Schema.String,
  url: Schema.String,
  detail: Schema.String,
  ageDays: Schema.Number,
})
export type AttentionItem = typeof AttentionItem.Type

export const HealthStatus = Schema.Literals(["strong", "watch", "risky"])
export type HealthStatus = typeof HealthStatus.Type

export const RepoInsight = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
  archived: Schema.Boolean,
  openIssues: Schema.Number,
  openPulls: Schema.Number,
  issuesClosed: Schema.Number,
  pullsMerged: Schema.Number,
  lastActivity: Schema.String,
  languages: Schema.Array(Language),
  ci: Schema.NullOr(
    Schema.Struct({ runs: Schema.Number, successRate: Schema.NullOr(Schema.Number) }),
  ),
  /** Issues and pull requests opened, closed, or merged per week, aligned with `weekly`. */
  activity: Schema.Array(Schema.Number),
  health: Schema.Struct({
    score: Schema.Number,
    status: HealthStatus,
    reasons: Schema.Array(Schema.String),
  }),
})
export type RepoInsight = typeof RepoInsight.Type

export const Insights = Schema.Struct({
  org: Schema.String,
  repos: Schema.Array(Schema.String),
  days: Schema.Literals(INSIGHT_DAYS),
  tz: Schema.String,
  generatedAt: Schema.String,
  window: Schema.Struct({ start: Schema.String, end: Schema.String }),
  tiles: Schema.Struct({
    /** `previous` is the count at the start of the window. */
    openIssues: Tile,
    openPulls: Tile,
    issuesOpened: Tile,
    issuesClosed: Tile,
    pullsMerged: Tile,
    medianIssueCloseHours: OptionalTile,
    medianPullMergeHours: OptionalTile,
    ciSuccessRate: OptionalTile,
  }),
  weekly: Schema.Array(InsightWeek),
  pullMergeTime: Schema.Struct({
    p50: Schema.NullOr(Schema.Number),
    p75: Schema.NullOr(Schema.Number),
    p90: Schema.NullOr(Schema.Number),
    buckets: Schema.Array(Bucket),
  }),
  /** Open issues by age. */
  issueAge: Schema.Array(Bucket),
  labels: Schema.Array(
    Schema.Struct({ name: Schema.String, color: Schema.String, count: Schema.Number }),
  ),
  contributors: Schema.Array(
    Schema.Struct({
      login: Schema.String,
      avatarUrl: Schema.String,
      pullsMerged: Schema.Number,
      issuesClosed: Schema.Number,
    }),
  ),
  /** Events per weekday (Monday first) and hour in the request's time zone. */
  punchcard: Schema.Array(Schema.Array(Schema.Number)),
  languages: Schema.Array(Language),
  ci: Schema.NullOr(CiSummary),
  milestones: Schema.Array(
    Schema.Struct({
      repo: Schema.String,
      title: Schema.String,
      url: Schema.String,
      openIssues: Schema.Number,
      closedIssues: Schema.Number,
      dueOn: Schema.NullOr(Schema.String),
    }),
  ),
  attention: Schema.Array(AttentionItem),
  repoStats: Schema.Array(RepoInsight),
  failedRepos: Schema.Array(Schema.Struct({ repo: Schema.String, message: Schema.String })),
})
export type Insights = typeof Insights.Type

export const ActivityDay = Schema.Struct({ date: Schema.String, count: Schema.Number })
export type ActivityDay = typeof ActivityDay.Type

export const Activity = Schema.Struct({
  /** Every day of the last year, oldest first, ending today in the request's time zone. */
  days: Schema.Array(ActivityDay),
  total: Schema.Number,
  currentStreak: Schema.Number,
  longestStreak: Schema.Number,
  busiestDay: Schema.NullOr(ActivityDay),
})
export type Activity = typeof Activity.Type
