import { Schema } from "effect"

export class ForgejoUnauthorized extends Schema.TaggedError<ForgejoUnauthorized>()(
  "ForgejoUnauthorized",
  {},
) {}

export class ForgejoRequestFailed extends Schema.TaggedError<ForgejoRequestFailed>()(
  "ForgejoRequestFailed",
  { status: Schema.Number },
) {}

export class ForgejoUnreachable extends Schema.TaggedError<ForgejoUnreachable>()(
  "ForgejoUnreachable",
  { message: Schema.String },
) {}

export class ForgejoDecodeFailed extends Schema.TaggedError<ForgejoDecodeFailed>()(
  "ForgejoDecodeFailed",
  { message: Schema.String },
) {}

/** The OAuth token endpoint rejected the code or refresh token itself (dead, expired, or already used). */
export class OAuthGrantRejected extends Schema.TaggedError<OAuthGrantRejected>()(
  "OAuthGrantRejected",
  {},
) {}

export class OAuthStateInvalid extends Schema.TaggedError<OAuthStateInvalid>()(
  "OAuthStateInvalid",
  {},
) {}

export class OAuthCallbackInvalid extends Schema.TaggedError<OAuthCallbackInvalid>()(
  "OAuthCallbackInvalid",
  { message: Schema.String },
) {}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()("SessionNotFound", {}) {}

export class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()("ConfigInvalid", {
  message: Schema.String,
}) {}

export type ForgejoError =
  | ForgejoUnauthorized
  | ForgejoRequestFailed
  | ForgejoUnreachable
  | ForgejoDecodeFailed

/** Errors that leave Forgejo usable but one read failed; a dashboard section shows them. */
export type ForgejoReadError = Exclude<ForgejoError, ForgejoUnauthorized>

export const describeForgejoError = (error: ForgejoReadError) => {
  switch (error._tag) {
    case "ForgejoRequestFailed":
      return `Forgejo returned HTTP ${error.status}`
    case "ForgejoUnreachable":
      return "Forgejo is unreachable"
    case "ForgejoDecodeFailed":
      return "Forgejo sent an unexpected response"
  }
}
