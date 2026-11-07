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
