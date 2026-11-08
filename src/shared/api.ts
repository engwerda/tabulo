import { Schema } from "effect"

export const Label = Schema.Struct({ id: Schema.Number, name: Schema.String, color: Schema.String })

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
  /** Forgejo's user id, which a rename does not change. */
  id: Schema.Number,
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
  /** The issue's poster. */
  author: Schema.Struct({ login: Schema.String, avatarUrl: Schema.String }),
  comments: Schema.Number,
  createdAt: Schema.String,
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

/** A new issue created from a board column, in that column. */
export const CreateCardRequest = Schema.Struct({
  org: Schema.String,
  repo: Schema.String,
  title: Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty(), Schema.isMaxLength(255)),
  /** A Todo or Status column key; Done is refused. */
  column: Schema.String,
})
export type CreateCardRequest = typeof CreateCardRequest.Type

export const CreateCardResult = Schema.Struct({
  /** The new card, ranked at the top of its column. */
  card: BoardCard,
  /** False when Forgejo created the issue but Tabulo could not store the card's rank. */
  orderSaved: Schema.Boolean,
})
export type CreateCardResult = typeof CreateCardResult.Type

/** A comment on an issue, rendered by Forgejo. */
export const CardComment = Schema.Struct({
  id: Schema.Number,
  author: Schema.Struct({ login: Schema.String, avatarUrl: Schema.String }),
  createdAt: Schema.String,
  bodyHtml: Schema.String,
})
export type CardComment = typeof CardComment.Type

/** What a card's detail panel shows beyond the card itself. */
export const CardDetail = Schema.Struct({
  key: Schema.String,
  /** The description as Forgejo renders it; empty when the issue has none. */
  bodyHtml: Schema.String,
  /** The latest comments, oldest first; at most 20. */
  comments: Schema.Array(CardComment),
  /** How many comments the issue has, which can exceed `comments.length`. */
  commentCount: Schema.Number,
})
export type CardDetail = typeof CardDetail.Type

/** What a card's labels, milestone, and assignees can be set to in one repository. */
export const IssueOptions = Schema.Struct({
  /** Organization and repository labels, without status column labels or archived labels. */
  labels: Schema.Array(BoardLabel),
  /** The repository's open milestones. */
  milestones: Schema.Array(Schema.Struct({ id: Schema.Number, title: Schema.String })),
  /** Users Forgejo lets be assigned to the repository's issues. */
  assignees: Schema.Array(Schema.Struct({ login: Schema.String, avatarUrl: Schema.String })),
})
export type IssueOptions = typeof IssueOptions.Type

const IssueRef = {
  org: Schema.String,
  repo: Schema.String,
  number: Schema.Int.check(Schema.isGreaterThan(0)),
}

/** Adds or removes one assignee, keeping the others. */
export const SetAssigneeRequest = Schema.Struct({
  ...IssueRef,
  login: Schema.String,
  assigned: Schema.Boolean,
})
export type SetAssigneeRequest = typeof SetAssigneeRequest.Type

/** Adds or removes one label that is not a status column label, keeping the others. */
export const SetLabelRequest = Schema.Struct({
  ...IssueRef,
  labelId: Schema.Int.check(Schema.isGreaterThan(0)),
  present: Schema.Boolean,
})
export type SetLabelRequest = typeof SetLabelRequest.Type

/** Sets the milestone, or clears it with null. */
export const SetMilestoneRequest = Schema.Struct({
  ...IssueRef,
  milestoneId: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
})
export type SetMilestoneRequest = typeof SetMilestoneRequest.Type

/** The card after a label, milestone, or assignee change, as the board shows it. */
export const CardUpdateResult = Schema.Struct({ card: BoardCard })
export type CardUpdateResult = typeof CardUpdateResult.Type

export const AddCommentRequest = Schema.Struct({
  ...IssueRef,
  body: Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty(), Schema.isMaxLength(65_535)),
})
export type AddCommentRequest = typeof AddCommentRequest.Type

export const AddCommentResult = Schema.Struct({ comment: CardComment })
export type AddCommentResult = typeof AddCommentResult.Type
// Insights and activity.

export const INSIGHT_DAYS = [1, 7, 30, 90, 180, 365] as const
export type InsightDays = (typeof INSIGHT_DAYS)[number]
export type InsightGrain = "hour" | "day" | "week"
/** The period each range is counted in. */
export const INSIGHT_GRAIN: Record<InsightDays, InsightGrain> = {
  1: "hour",
  7: "day",
  30: "week",
  90: "week",
  180: "week",
  365: "week",
}

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

export const InsightPeriod = Schema.Struct({
  /**
   * When the period starts: an ISO instant for an hour, because a daylight saving change repeats
   * a wall-clock hour, and `YYYY-MM-DD` in the request's time zone for a day or a week (its
   * Monday).
   */
  start: Schema.String,
  issuesOpened: Schema.Number,
  issuesClosed: Schema.Number,
  pullsOpened: Schema.Number,
  pullsMerged: Schema.Number,
  /** Open issues at the end of the period, or now for the current period. */
  openIssues: Schema.Number,
})
export type InsightPeriod = typeof InsightPeriod.Type

export const Language = Schema.Struct({ name: Schema.String, bytes: Schema.Number })
export type Language = typeof Language.Type

export const CiPeriod = Schema.Struct({
  start: Schema.String,
  success: Schema.Number,
  failure: Schema.Number,
  /** Cancelled, skipped, and unfinished runs. */
  other: Schema.Number,
})
export type CiPeriod = typeof CiPeriod.Type

export const CiSummary = Schema.Struct({
  /** Workflow runs created in the window. */
  runs: Schema.Number,
  /** Passed runs among the runs that passed or failed. */
  successRate: Schema.NullOr(Schema.Number),
  medianDurationMinutes: Schema.NullOr(Schema.Number),
  series: Schema.Array(CiPeriod),
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
  /** Issues and pull requests opened, closed, or merged per period, aligned with `series`. */
  activity: Schema.Array(Schema.Number),
  health: Schema.Struct({
    score: Schema.Number,
    status: HealthStatus,
    reasons: Schema.Array(Schema.String),
  }),
})
export type RepoInsight = typeof RepoInsight.Type

/** A listing of a repository that Tabulo stopped reading before its end. */
export const IncompleteListing = Schema.Struct({
  repo: Schema.String,
  listing: Schema.Literals(["open", "closed", "runs", "milestones"]),
})
export type IncompleteListing = typeof IncompleteListing.Type

export const Insights = Schema.Struct({
  org: Schema.String,
  repos: Schema.Array(Schema.String),
  days: Schema.Literals(INSIGHT_DAYS),
  tz: Schema.String,
  generatedAt: Schema.String,
  /**
   * The first and last day of the window in `tz`, `YYYY-MM-DD`. It starts at the beginning of
   * an hour, a day, or a week (`INSIGHT_GRAIN`) and ends now, so the last period in `series` is
   * still in progress.
   */
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
  series: Schema.Array(InsightPeriod),
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
  incomplete: Schema.Array(IncompleteListing),
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

export const EpicChild = Schema.Union([
  Schema.TaggedStruct("Issue", {
    key: Schema.String,
    repo: Schema.String,
    number: Schema.Number,
    title: Schema.String,
    url: Schema.String,
    state: Schema.Literals(["open", "closed"]),
    kind: Schema.Literals(["issue", "pull"]),
    column: Schema.String,
    assignees: BoardCard.fields.assignees,
  }),
  Schema.TaggedStruct("Unavailable", { ref: Schema.String }),
])
export type EpicChild = typeof EpicChild.Type

export const Epic = Schema.Struct({
  key: Schema.String,
  repo: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  assignees: BoardCard.fields.assignees,
  milestone: Schema.NullOr(Schema.String),
  labels: Schema.Array(BoardLabel),
  updatedAt: Schema.String,
  column: Schema.String,
  progress: Schema.Struct({
    total: Schema.Number,
    done: Schema.Number,
    byColumn: Schema.Record(Schema.String, Schema.Number),
  }),
  children: Schema.Array(EpicChild),
})
export type Epic = typeof Epic.Type

/** An issue listing of a repository that the Epics page budget cut short. */
export const IncompleteEpicListing = Schema.Struct({
  repo: Schema.String,
  listing: Schema.Literals(["open", "closed"]),
})
export type IncompleteEpicListing = typeof IncompleteEpicListing.Type

export const Epics = Schema.Struct({
  org: Schema.String,
  repos: Schema.Array(Schema.String),
  columns: Schema.Array(BoardColumn),
  epics: Schema.Array(Epic),
  failedRepos: Schema.Array(Schema.Struct({ repo: Schema.String, message: Schema.String })),
  incomplete: Schema.Struct({
    /** Epics in the unread part of these listings are missing. */
    listings: Schema.Array(IncompleteEpicListing),
    /** Child references Tabulo did not look up; they show as unavailable. */
    children: Schema.Number,
  }),
})
export type Epics = typeof Epics.Type
/** Issues and pull requests matching a search, open ones first. */
export const SearchResults = Schema.Struct({ items: Schema.Array(DashboardItem) })
export type SearchResults = typeof SearchResults.Type

/** Where Forgejo lives, for links the client builds itself, such as a repository's page. */
export const Instance = Schema.Struct({ forgejoUrl: Schema.String })
export type Instance = typeof Instance.Type
