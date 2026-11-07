import { Effect } from "effect"
import type { DashboardItem, SearchResults } from "../shared/api.ts"
import { toDashboardItem } from "./dashboard.ts"
import { BoardRequestInvalid } from "./errors.ts"
import { type AccessToken, ForgejoClient } from "./forgejo/client.ts"

const MAX_QUERY_LENGTH = 100
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20

export const parseSearchQuery = (q: string | undefined, limit: string | undefined) =>
  Effect.gen(function* () {
    const text = (q ?? "").trim()
    if (text.length === 0 || text.length > MAX_QUERY_LENGTH) {
      return yield* new BoardRequestInvalid({
        message: `q must be 1 to ${MAX_QUERY_LENGTH} characters`,
      })
    }
    const count = limit === undefined ? DEFAULT_LIMIT : Number(limit)
    if (!Number.isInteger(count) || count < 1) {
      return yield* new BoardRequestInvalid({ message: "limit must be a positive integer" })
    }
    return { q: text, limit: Math.min(count, MAX_LIMIT) }
  })

/** Open matches first; closed ones fill what is left of the limit. */
export const searchItems = (token: AccessToken, query: { q: string; limit: number }) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const open = yield* forgejo.searchIssueText(token, query.q, "open", query.limit)
    const closed =
      open.length >= query.limit
        ? []
        : yield* forgejo.searchIssueText(token, query.q, "closed", query.limit - open.length)
    const items: ReadonlyArray<DashboardItem> = [...open, ...closed]
      .slice(0, query.limit)
      .map(toDashboardItem)
    return { items } satisfies SearchResults
  })
