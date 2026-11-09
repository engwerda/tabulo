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

/** Tabulo refuses a board write before sending it: the viewer may not change this card. */
export class BoardWriteForbidden extends Schema.TaggedError<BoardWriteForbidden>()(
  "BoardWriteForbidden",
  { message: Schema.String },
) {}

/**
 * The user's board is out of date: a move's card or neighbours are not where the user saw them,
 * or a board's version is not the one the user loaded.
 */
export class BoardChanged extends Schema.TaggedError<BoardChanged>()("BoardChanged", {}) {}

/** The organization has no board with this id. */
export class BoardNotFound extends Schema.TaggedError<BoardNotFound>()("BoardNotFound", {}) {}

/** A new board would be one more than an organization may have. */
export class BoardLimitReached extends Schema.TaggedError<BoardLimitReached>()(
  "BoardLimitReached",
  {},
) {}

/** A move needed several Forgejo writes, and one failed after an earlier one succeeded. */
export class ForgejoMovePartlyApplied extends Schema.TaggedError<ForgejoMovePartlyApplied>()(
  "ForgejoMovePartlyApplied",
  { reason: Schema.String },
) {}

/** A listing that the whole response depends on did not fit in the request's Forgejo pages. */
export class PageBudgetExhausted extends Schema.TaggedError<PageBudgetExhausted>()(
  "PageBudgetExhausted",
  {},
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

export const describeForgejoError = (error: ForgejoError) => {
  switch (error._tag) {
    case "ForgejoUnauthorized":
      return "Forgejo did not accept your sign-in"
    case "ForgejoForbidden":
      return "Forgejo did not allow this"
    case "ForgejoNotFound":
      return "Not found in Forgejo, or you cannot see it"
    case "ForgejoRequestFailed":
      return `Forgejo had a problem (HTTP ${error.status}); try again in a moment`
    case "ForgejoUnreachable":
      return "Forgejo did not respond; try again in a moment"
    case "ForgejoDecodeFailed":
      return "Forgejo sent an answer Tabulo does not understand"
  }
}
