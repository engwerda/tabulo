import { Clock, Context, Effect } from "effect"
import type { Epic, EpicChild, Epics, IncompleteEpicListing } from "../shared/api.ts"
import {
  BoardConfig,
  boardLayout,
  cardKey,
  defaultPlan,
  readOrgLabels,
  toBoardCard,
} from "./board.ts"
import { type EpicReference, parseEpicChildren } from "./epic-links.ts"
import { describeForgejoError, FORGEJO_READ_ERRORS } from "./errors.ts"
import { type AccessToken, ForgejoClient, type PageBudget, sharePages } from "./forgejo/client.ts"
import type { ForgejoEpicIssue, ForgejoRepo, ForgejoRepoIssue } from "./forgejo/schemas.ts"

export class EpicsConfig extends Context.Service<EpicsConfig, { readonly label: string }>()(
  "tabulo/EpicsConfig",
) {}

const MAX_CHILD_LOOKUPS = 200
const CHILD_CONCURRENCY = 4

type RepoEpics =
  | {
      readonly _tag: "Loaded"
      readonly repo: ForgejoRepo
      readonly issues: ReadonlyArray<ForgejoEpicIssue>
      readonly incomplete: ReadonlyArray<IncompleteEpicListing["listing"]>
    }
  | { readonly _tag: "Failed"; readonly repo: string; readonly message: string }

/**
 * Loads the epics of `query`. Labels, listings, and child lookups take their pages from `pool`,
 * in that order.
 */
export const loadEpics = Effect.fn("loadEpics")(function* (
  token: AccessToken,
  query: { org: string; repos: ReadonlyArray<string> },
  pool: PageBudget,
) {
  const settings = yield* BoardConfig
  const config = yield* EpicsConfig
  const forgejo = yield* ForgejoClient
  const [orgLabels, plan] = yield* Effect.all(
    [readOrgLabels(token, query.org, pool), defaultPlan(query.org)],
    { concurrency: "unbounded" },
  )
  // Hidden columns count too, so progress includes every child.
  const layout = boardLayout(settings.statusScope, orgLabels, { columns: plan.columns, hidden: [] })
  const windowStart = (yield* Clock.currentTimeMillis) - settings.doneDays * 86_400_000
  const updatedSince = new Date(windowStart).toISOString()
  const share = sharePages(pool, query.repos.length)
  const results = yield* Effect.forEach(
    query.repos,
    (name) => {
      const ref = { owner: query.org, name }
      return share((budget) =>
        Effect.all(
          [
            forgejo.repo(token, ref),
            forgejo.repoEpicIssues(token, ref, { state: "open" }, budget),
            forgejo.repoEpicIssues(token, ref, { state: "closed", updatedSince }, budget),
          ],
          { concurrency: "unbounded" },
        ),
      ).pipe(
        Effect.map(
          ([repo, open, closed]): RepoEpics => ({
            _tag: "Loaded",
            repo,
            issues: [...open.items, ...closed.items],
            incomplete: [
              ...(open.complete ? [] : ["open" as const]),
              ...(closed.complete ? [] : ["closed" as const]),
            ],
          }),
        ),
        Effect.catchTag(FORGEJO_READ_ERRORS, (error) =>
          Effect.succeed<RepoEpics>({
            _tag: "Failed",
            repo: name,
            message: describeForgejoError(error),
          }),
        ),
      )
    },
    { concurrency: 2 },
  )
  const loaded = results.flatMap((result) => (result._tag === "Loaded" ? [result] : []))
  const listed = new Map<string, ForgejoRepoIssue>()
  const epics: Array<{
    repo: ForgejoRepo
    issue: ForgejoEpicIssue
    refs: ReadonlyArray<EpicReference>
  }> = []
  for (const { repo, issues } of loaded) {
    for (const issue of issues) {
      listed.set(cardKey(query.org, repo.name, issue.number), issue)
      if (
        issue.pull_request == null &&
        issue.labels.some((label) => label.name === config.label) &&
        (issue.state === "open" ||
          (issue.closed_at !== null && Date.parse(issue.closed_at) >= windowStart))
      )
        epics.push({
          repo,
          issue,
          refs: parseEpicChildren(
            issue.body ?? "",
            { owner: query.org, name: repo.name },
            forgejo.baseUrl,
          ),
        })
    }
  }
  const missing = new Map(
    epics
      .flatMap(({ refs }) => refs)
      .filter(({ ref }) => !listed.has(ref))
      .map((ref) => [ref.ref, ref]),
  )
  const toChild = (ref: EpicReference, issue: ForgejoRepoIssue): EpicChild => ({
    _tag: "Issue",
    key: ref.ref,
    repo: issue.repository.full_name,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: issue.state,
    kind: issue.pull_request == null ? "issue" : "pull",
    column: layout.columnOf(issue),
    assignees: (issue.assignees ?? []).map(({ login, avatar_url }) => ({
      login,
      avatarUrl: avatar_url,
    })),
  })
  const lookups = [...missing.values()].slice(0, Math.min(MAX_CHILD_LOOKUPS, pool.remaining))
  const resolved = new Map(
    yield* Effect.forEach(
      lookups,
      (ref) =>
        Effect.suspend(() => {
          pool.remaining -= 1
          return forgejo.issue(token, ref, ref.number)
        }).pipe(
          Effect.map((issue) => [ref.ref, toChild(ref, issue)] as const),
          Effect.catchTag(["ForgejoForbidden", "ForgejoNotFound"], () =>
            Effect.succeed([
              ref.ref,
              { _tag: "Unavailable", ref: ref.ref } satisfies EpicChild,
            ] as const),
          ),
        ),
      { concurrency: CHILD_CONCURRENCY },
    ),
  )
  return {
    org: query.org,
    repos: query.repos,
    columns: layout.columns,
    epics: epics.map(({ repo, issue, refs }): Epic => {
      const {
        closedAt: _closedAt,
        readOnlyReason: _readOnlyReason,
        ...card
      } = toBoardCard(layout, query.org, repo, issue)
      const children = refs.map((ref): EpicChild => {
        const local = listed.get(ref.ref)
        return local === undefined
          ? (resolved.get(ref.ref) ?? { _tag: "Unavailable", ref: ref.ref })
          : toChild(ref, local)
      })
      const byColumn: Record<string, number> = Object.fromEntries(
        layout.columns.map(({ key }) => [key, 0]),
      )
      for (const child of children)
        if (child._tag === "Issue") byColumn[child.column] = (byColumn[child.column] ?? 0) + 1
      return {
        ...card,
        children,
        progress: { total: children.length, done: byColumn.done ?? 0, byColumn },
      }
    }),
    failedRepos: results.flatMap((result) =>
      result._tag === "Failed" ? [{ repo: result.repo, message: result.message }] : [],
    ),
    incomplete: {
      listings: loaded.flatMap(({ repo, incomplete }) =>
        incomplete.map((listing) => ({ repo: repo.name, listing })),
      ),
      children: missing.size - lookups.length,
    },
  } satisfies Epics
})
