import { Schema } from "effect"

export class ForgejoUnauthorized extends Schema.TaggedError<ForgejoUnauthorized>()(
  "ForgejoUnauthorized",
  {},
) {}

export class ForgejoRequestFailed extends Schema.TaggedError<ForgejoRequestFailed>()(
  "ForgejoRequestFailed",
  { status: Schema.Number },
) {}

/** Forgejo refused the request for this user, for example a write without push access. */
export class ForgejoForbidden extends Schema.TaggedError<ForgejoForbidden>()(
  "ForgejoForbidden",
  {},
) {}

/** The organization, repository, or issue does not exist or the user cannot see it. */
export class ForgejoNotFound extends Schema.TaggedError<ForgejoNotFound>()("ForgejoNotFound", {}) {}

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

export class BoardRequestInvalid extends Schema.TaggedError<BoardRequestInvalid>()(
  "BoardRequestInvalid",
  { message: Schema.String },
) {}

/** The user's repository permissions do not allow changing its issues. */
export class RepoWriteForbidden extends Schema.TaggedError<RepoWriteForbidden>()(
  "RepoWriteForbidden",
  { repo: Schema.String },
) {}

export class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()("ConfigInvalid", {
  message: Schema.String,
}) {}

export type ForgejoError =
  | ForgejoUnauthorized
  | ForgejoForbidden
  | ForgejoNotFound
  | ForgejoRequestFailed
  | ForgejoUnreachable
  | ForgejoDecodeFailed

/** Errors that leave Forgejo usable but one read failed; a dashboard section shows them. */
export type ForgejoReadError = Exclude<ForgejoError, ForgejoUnauthorized>

export const FORGEJO_READ_ERRORS = [
  "ForgejoForbidden",
  "ForgejoNotFound",
  "ForgejoRequestFailed",
  "ForgejoUnreachable",
  "ForgejoDecodeFailed",
] as const satisfies ReadonlyArray<ForgejoReadError["_tag"]>

export const describeForgejoError = (error: ForgejoReadError) => {
  switch (error._tag) {
    case "ForgejoForbidden":
      return "Forgejo returned HTTP 403"
    case "ForgejoNotFound":
      return "Forgejo returned HTTP 404"
    case "ForgejoRequestFailed":
      return `Forgejo returned HTTP ${error.status}`
    case "ForgejoUnreachable":
      return "Forgejo is unreachable"
    case "ForgejoDecodeFailed":
      return "Forgejo sent an unexpected response"
  }
}
