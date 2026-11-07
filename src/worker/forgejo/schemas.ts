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

/** A user where Forgejo names one beside other data: a poster, an assignee, an author. */
export const ForgejoPerson = Schema.Struct({ login: Schema.String, avatar_url: Schema.String })
export type ForgejoPerson = typeof ForgejoPerson.Type

export const ForgejoMilestone = Schema.Struct({ id: Schema.Number, title: Schema.String })
export type ForgejoMilestone = typeof ForgejoMilestone.Type

/** An issue as the repository issue endpoints return it. */
export const ForgejoRepoIssue = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  html_url: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  labels: Schema.Array(ForgejoLabel),
  assignees: Schema.NullOr(Schema.Array(ForgejoPerson)),
  milestone: Schema.NullOr(ForgejoMilestone),
  user: ForgejoPerson,
  comments: Schema.Number,
  created_at: Schema.String,
  updated_at: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  pull_request: Schema.optionalKey(Schema.NullOr(Schema.Struct({}))),
})
export type ForgejoRepoIssue = typeof ForgejoRepoIssue.Type

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
