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
