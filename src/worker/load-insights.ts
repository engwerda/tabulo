import { Clock, Effect } from "effect"
import {
  type Activity,
  INSIGHT_DAYS,
  type IncompleteListing,
  type InsightDays,
  type Insights,
} from "../shared/api.ts"
import { buildActivity } from "./activity.ts"
import { parseBoardQuery } from "./board.ts"
import {
  BoardRequestInvalid,
  describeForgejoError,
  FORGEJO_READ_ERRORS,
  type ForgejoUnauthorized,
} from "./errors.ts"
import { type AccessToken, ForgejoClient, type PageBudget } from "./forgejo/client.ts"
import { buildInsights, type RepoActivity } from "./insights.ts"
import { DAY_MS, isTimeZone } from "./time-zone.ts"

// Each repository needs three Forgejo reads at once; Workers allow six open connections.
const REPO_CONCURRENCY = 2
const READS_PER_REPO = 3
const MAX_TIME_ZONE_LENGTH = 64
// Workers allow 1,000 subrequests per request. Listing pages share this budget; besides them,
// each repository reads itself and its languages, and the session may refresh its token.
const PAGE_BUDGET = 800
const LISTINGS = ["open", "closed", "runs", "milestones"] as const

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
export const loadInsights = (token: AccessToken, query: InsightsQuery) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const now = yield* Clock.currentTimeMillis
    // The window before the shown one feeds the change on each stat tile.
    const since = now - 2 * query.days * DAY_MS
    const updatedSince = new Date(since).toISOString()

    const pool: PageBudget = { remaining: PAGE_BUDGET }
    let reposLeft = query.repos.length

    const readRepo = (name: string): Effect.Effect<RepoResult, ForgejoUnauthorized> => {
      const ref = { owner: query.org, name }
      // A fair share of the pages left. What a repository does not use goes back to the pool.
      const budget: PageBudget = { remaining: 0 }
      const reserve = Effect.sync(() => {
        budget.remaining = Math.floor(pool.remaining / reposLeft)
        pool.remaining -= budget.remaining
        reposLeft -= 1
      })
      const release = Effect.sync(() => {
        pool.remaining += budget.remaining
      })
      const read = Effect.all(
        {
          repo: forgejo.insightRepo(token, ref),
          languages: forgejo.repoLanguages(token, ref),
          milestones: forgejo.openMilestones(token, ref, budget),
          open: forgejo.repoIssuesAndPulls(token, ref, { state: "open" }, budget),
          closed: forgejo.repoIssuesAndPulls(token, ref, { state: "closed", updatedSince }, budget),
          runs: forgejo.actionRuns(token, ref, since, budget),
        },
        { concurrency: READS_PER_REPO },
      )
      return Effect.andThen(reserve, read).pipe(
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
        Effect.ensuring(release),
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
