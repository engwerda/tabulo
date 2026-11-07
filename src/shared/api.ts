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
