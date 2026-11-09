import { Parser } from "commonmark"
import { Clock, Context, Effect } from "effect"
import type { Epic, EpicChild, Epics, IncompleteEpicListing } from "../shared/api.ts"
import { BoardConfig, boardLayout, cardKey, readOrgLabels, toBoardCard } from "./board.ts"
import { describeForgejoError, FORGEJO_READ_ERRORS } from "./errors.ts"
import {
  type AccessToken,
  ForgejoClient,
  type PageBudget,
  type RepoRef,
  sharePages,
} from "./forgejo/client.ts"
import type { ForgejoEpicIssue, ForgejoRepo, ForgejoRepoIssue } from "./forgejo/schemas.ts"

export type EpicReference = RepoRef & { readonly number: number; readonly ref: string }

const MAX_CHILDREN = 200
const NAME = "[A-Za-z0-9_.-]+"
const SHORT_REF = new RegExp(`^(?:(?:(${NAME})/)?(${NAME}))?#([1-9][0-9]*)(?![A-Za-z0-9])`)
const ISSUE_PATH = new RegExp(`^/(${NAME})/(${NAME})/(?:issues|pulls)/([1-9][0-9]*)/?$`)
// Forgejo's Goldmark task list extension reads the checkbox from the source of the item's first
// line, so escapes, emphasis, and link definitions there make it plain text.
const TASK = /^\[[ xX]\][\t ]+(.*)/
const firstWord = (text: string) => /^\S*/.exec(text.trimStart())?.[0] ?? ""

/** The text and destination of the inline link `text` starts with, as CommonMark reads it. */
const leadingLink = (text: string) => {
  const block = new Parser().parse(text).firstChild
  const link = block?.type === "paragraph" ? block.firstChild : null
  if (link?.type !== "link") return undefined
  // A code span keeps its place as a backtick, so a word in it is never the reference.
  let label = ""
  const walker = link.walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    if (!step.entering) continue
    if (step.node.type === "text") label += step.node.literal ?? ""
    if (step.node.type === "code") label += "`"
  }
  return { label, destination: link.destination ?? "" }
}

/** The issue that `token`, a word or link destination after a checkbox, names, if valid. */
const referenceOf = (
  token: string,
  repository: RepoRef,
  base: URL,
  prefix: string,
): EpicReference | undefined => {
  const target = token.replace(/^[(<[*_]+/, "")
  let owner = repository.owner
  let name = repository.name
  let number: number
  const short = SHORT_REF.exec(target)
  if (short !== null) {
    owner = short[1] ?? owner
    name = short[2] ?? name
    number = Number(short[3])
  } else {
    const link = /^[^<>()[\]]+/.exec(target)?.[0].replace(/[.,:;!?*_]+$/, "") ?? ""
    if (!URL.canParse(link)) return undefined
    const url = new URL(link)
    if (url.origin !== base.origin || !url.pathname.startsWith(`${prefix}/`)) return undefined
    const issue = ISSUE_PATH.exec(url.pathname.slice(prefix.length))
    if (issue === null) return undefined
    owner = issue[1] ?? owner
    name = issue[2] ?? name
    number = Number(issue[3])
  }
  if (!Number.isSafeInteger(number) || [owner, name].some((part) => part === "." || part === ".."))
    return undefined
  owner = owner.toLowerCase()
  name = name.toLowerCase()
  return { owner, name, number, ref: `${owner}/${name}#${number}` }
}

/**
 * The issues that the task-list items of an epic's body reference, in body order. The body is
 * parsed as CommonMark, as Forgejo renders it, so code and HTML never hold task items. The
 * checkbox and reference come from the source text of each item's first line. A leading inline
 * link names its issue by its text or, failing that, its destination.
 */
export const parseEpicChildren = (
  body: string,
  repository: RepoRef,
  forgejoUrl: string,
): ReadonlyArray<EpicReference> => {
  const base = new URL(forgejoUrl)
  const prefix = base.pathname.replace(/\/$/, "")
  const children = new Map<string, EpicReference>()
  const lines = body.split(/\r\n|\r|\n/)
  const named = (token: string) => referenceOf(token, repository, base, prefix)
  const walker = new Parser().parse(body).walker()
  for (let step = walker.next(); step !== null; step = walker.next()) {
    const paragraph = step.node.firstChild
    if (!step.entering || step.node.type !== "item" || paragraph?.type !== "paragraph") continue
    const [[line, column]] = paragraph.sourcepos
    const text = TASK.exec(lines[line - 1]?.slice(column - 1) ?? "")?.[1]
    if (text === undefined) continue
    const link = leadingLink(text)
    const reference =
      link === undefined
        ? named(firstWord(text))
        : (named(firstWord(link.label)) ??
          (/^https?:\/\//i.test(link.destination) ? named(link.destination) : undefined))
    if (reference === undefined) continue
    children.set(reference.ref, reference)
    if (children.size === MAX_CHILDREN) break
  }
  return [...children.values()]
}

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
  // Every column counts, hidden or not, so progress includes every child.
  const layout = boardLayout(settings.statusScope, yield* readOrgLabels(token, query.org, pool), {
    columns: settings.defaultColumns,
    hidden: [],
  })
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
