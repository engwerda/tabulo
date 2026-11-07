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
  // Present whenever the request is authenticated.
  permissions: Schema.optionalKey(Schema.Struct({ admin: Schema.Boolean, push: Schema.Boolean })),
})
export type ForgejoRepo = typeof ForgejoRepo.Type
