import { Clock, Effect } from "effect"
import {
  type Activity,
  DEFAULT_INSIGHT_DAYS,
  INSIGHT_DAYS,
  type IncompleteListing,
  type InsightDays,
  type Insights,
} from "../shared/api.ts"
import { buildActivity } from "./activity.ts"
import { BoardConfig, parseBoardQuery } from "./board.ts"
import {
  BoardRequestInvalid,
  describeForgejoError,
  FORGEJO_READ_ERRORS,
  type ForgejoUnauthorized,
} from "./errors.ts"
import { type AccessToken, ForgejoClient, type PageBudget, sharePages } from "./forgejo/client.ts"
import { buildInsights, insightPeriods, type RepoActivity } from "./insights.ts"
import { isTimeZone } from "./time-zone.ts"

// Each repository needs three Forgejo reads at once; Workers allow six open connections.
const REPO_CONCURRENCY = 2
const READS_PER_REPO = 3
const MAX_TIME_ZONE_LENGTH = 64
const LISTINGS = ["open", "closed", "runs", "milestones"] as const

/** An IANA time zone from a request; UTC when the request names none. */
export const parseTimeZone = (value: string | undefined) =>
  value === undefined
    ? Effect.succeed("UTC")
    : value.length <= MAX_TIME_ZONE_LENGTH && isTimeZone(value)
      ? Effect.succeed(value)
      : Effect.fail(new BoardRequestInvalid({ message: "tz is not a known time zone" }))

const parseDays = (value: string | undefined) => {
  const days =
    value === undefined
      ? DEFAULT_INSIGHT_DAYS
      : INSIGHT_DAYS.find((allowed) => String(allowed) === value)
  return days === undefined
    ? Effect.fail(
        new BoardRequestInvalid({ message: `days must be one of ${INSIGHT_DAYS.join(", ")}` }),
      )
    : Effect.succeed(days)
}

const LOGIN = /^[A-Za-z0-9_.-]{1,40}$/

/** The login to narrow the numbers to; null for everyone. */
const parseUser = (value: string | undefined) =>
  value === undefined
    ? Effect.succeed(null)
    : LOGIN.test(value)
      ? Effect.succeed(value)
      : Effect.fail(new BoardRequestInvalid({ message: "user is not a Forgejo login" }))

export type InsightsQuery = {
  readonly org: string
  readonly repos: ReadonlyArray<string>
  readonly days: InsightDays
  readonly tz: string
  readonly user: string | null
}

export const parseInsightsQuery = (query: {
  readonly org: string | undefined
  readonly repos: string | undefined
  readonly days: string | undefined
  readonly tz: string | undefined
  readonly user: string | undefined
}) =>
  Effect.all({
    scope: parseBoardQuery(query.org, query.repos),
    days: parseDays(query.days),
    tz: parseTimeZone(query.tz),
    user: parseUser(query.user),
  }).pipe(Effect.map(({ scope, days, tz, user }): InsightsQuery => ({ ...scope, days, tz, user })))

type RepoResult =
  | {
      readonly _tag: "Loaded"
      readonly activity: RepoActivity
      readonly incomplete: ReadonlyArray<IncompleteListing["listing"]>
    }
  | { readonly _tag: "Failed"; readonly repo: string; readonly message: string }

/**
 * Reads the chosen repositories as the user who owns `token` and aggregates them. A repository
 * that fails to load is reported in `failedRepos`, and a listing cut short by the page budget in
 * `incomplete`; only an auth failure escapes.
 */
export const loadInsights = (token: AccessToken, query: InsightsQuery, pool: PageBudget) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const { statusScope } = yield* BoardConfig
    const now = yield* Clock.currentTimeMillis
    // The window before the shown one feeds the change on each stat tile.
    const since = insightPeriods(now, query.days, query.tz).previous.start
    const updatedSince = new Date(since).toISOString()

    const share = sharePages(pool, query.repos.length)

    const readRepo = (name: string): Effect.Effect<RepoResult, ForgejoUnauthorized> => {
      const ref = { owner: query.org, name }
      return share((budget) =>
        Effect.all(
          {
            repo: forgejo.insightRepo(token, ref),
            languages: forgejo.repoLanguages(token, ref),
            milestones: forgejo.openMilestonesListing(token, ref, budget),
            open: forgejo.repoIssuesAndPulls(token, ref, { state: "open" }, budget),
            closed: forgejo.repoIssuesAndPulls(
              token,
              ref,
              { state: "closed", updatedSince },
              budget,
            ),
            runs: forgejo.actionRuns(token, ref, since, budget),
          },
          { concurrency: READS_PER_REPO },
        ),
      ).pipe(
        Effect.map(
          (lists): RepoResult => ({
            _tag: "Loaded",
            activity: {
              repo: lists.repo,
              languages: lists.languages,
              milestones: lists.milestones.items,
              open: lists.open.items,
              closed: lists.closed.items,
              runs: lists.runs?.items ?? null,
            },
            incomplete: LISTINGS.filter((listing) => lists[listing]?.complete === false),
          }),
        ),
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
      statusScope,
      loaded: results.flatMap((result) => (result._tag === "Loaded" ? [result.activity] : [])),
      failedRepos: results.flatMap((result) =>
        result._tag === "Failed" ? [{ repo: result.repo, message: result.message }] : [],
      ),
      incomplete: results.flatMap((result) =>
        result._tag === "Loaded"
          ? result.incomplete.map((listing) => ({ repo: result.activity.repo.name, listing }))
          : [],
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
