import { Clock, Effect } from "effect"
import { type Activity, INSIGHT_DAYS, type InsightDays, type Insights } from "../shared/api.ts"
import { buildActivity } from "./activity.ts"
import { parseBoardQuery } from "./board.ts"
import {
  BoardRequestInvalid,
  describeForgejoError,
  FORGEJO_READ_ERRORS,
  type ForgejoUnauthorized,
} from "./errors.ts"
import { type AccessToken, ForgejoClient } from "./forgejo/client.ts"
import { buildInsights, type RepoActivity } from "./insights.ts"
import { DAY_MS, isTimeZone } from "./time-zone.ts"

// Each repository needs three Forgejo reads at once; Workers allow six open connections.
const REPO_CONCURRENCY = 2
const READS_PER_REPO = 3
const MAX_TIME_ZONE_LENGTH = 64

/** An IANA time zone from a request; UTC when the request names none. */
export const parseTimeZone = (value: string | undefined) =>
  value === undefined
    ? Effect.succeed("UTC")
    : value.length <= MAX_TIME_ZONE_LENGTH && isTimeZone(value)
      ? Effect.succeed(value)
      : Effect.fail(new BoardRequestInvalid({ message: "tz is not a known time zone" }))

const parseDays = (value: string | undefined) => {
  const days = INSIGHT_DAYS.find((allowed) => String(allowed) === (value ?? "90"))
  return days === undefined
    ? Effect.fail(
        new BoardRequestInvalid({ message: `days must be one of ${INSIGHT_DAYS.join(", ")}` }),
      )
    : Effect.succeed(days)
}

export type InsightsQuery = {
  readonly org: string
  readonly repos: ReadonlyArray<string>
  readonly days: InsightDays
  readonly tz: string
}

export const parseInsightsQuery = (query: {
  readonly org: string | undefined
  readonly repos: string | undefined
  readonly days: string | undefined
  readonly tz: string | undefined
}) =>
  Effect.all({
    scope: parseBoardQuery(query.org, query.repos),
    days: parseDays(query.days),
    tz: parseTimeZone(query.tz),
  }).pipe(Effect.map(({ scope, days, tz }): InsightsQuery => ({ ...scope, days, tz })))

type RepoResult =
  | { readonly _tag: "Loaded"; readonly activity: RepoActivity }
  | { readonly _tag: "Failed"; readonly repo: string; readonly message: string }

/**
 * Reads the chosen repositories as the user who owns `token` and aggregates them. A repository
 * that fails to load is reported in `failedRepos`; only an auth failure escapes.
 */
export const loadInsights = (token: AccessToken, query: InsightsQuery) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const now = yield* Clock.currentTimeMillis
    // The window before the shown one feeds the change on each stat tile.
    const since = now - 2 * query.days * DAY_MS
    const updatedSince = new Date(since).toISOString()

    const readRepo = (name: string): Effect.Effect<RepoResult, ForgejoUnauthorized> => {
      const ref = { owner: query.org, name }
      return Effect.all(
        {
          repo: forgejo.insightRepo(token, ref),
          open: forgejo.repoIssuesAndPulls(token, ref, { state: "open" }),
          closed: forgejo.repoIssuesAndPulls(token, ref, { state: "closed", updatedSince }),
          runs: forgejo.actionRuns(token, ref, since),
          languages: forgejo.repoLanguages(token, ref),
          milestones: forgejo.openMilestones(token, ref),
        },
        { concurrency: READS_PER_REPO },
      ).pipe(
        Effect.map((activity): RepoResult => ({ _tag: "Loaded", activity })),
        Effect.catchTag(FORGEJO_READ_ERRORS, (error) =>
          Effect.sync((): RepoResult => {
            console.warn(`Insights repository ${query.org}/${name} failed`, error)
            return { _tag: "Failed", repo: name, message: describeForgejoError(error) }
          }),
        ),
      )
    }

    const results = yield* Effect.forEach(query.repos, readRepo, {
      concurrency: REPO_CONCURRENCY,
    })
    return buildInsights({
      ...query,
      now,
      loaded: results.flatMap((result) => (result._tag === "Loaded" ? [result.activity] : [])),
      failedRepos: results.flatMap((result) =>
        result._tag === "Failed" ? [{ repo: result.repo, message: result.message }] : [],
      ),
    }) satisfies Insights
  })

/** The contribution calendar of the user who owns `token`. */
export const loadActivity = (token: AccessToken, login: string, tz: string) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const entries = yield* forgejo.userHeatmap(token, login)
    return buildActivity(entries, tz, yield* Clock.currentTimeMillis) satisfies Activity
  })
