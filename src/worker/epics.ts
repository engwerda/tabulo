import { Clock, Context, Effect } from "effect"
import type { Epic, EpicChild, Epics } from "../shared/api.ts"
import { BoardConfig, boardLayout, cardKey, toBoardCard } from "./board.ts"
import { describeForgejoError, FORGEJO_READ_ERRORS } from "./errors.ts"
import { type AccessToken, ForgejoClient, type RepoRef } from "./forgejo/client.ts"
import type { ForgejoEpicIssue, ForgejoRepo, ForgejoRepoIssue } from "./forgejo/schemas.ts"

export type EpicReference = RepoRef & { readonly number: number; readonly ref: string }

const MAX_CHILDREN = 200
const NAME = "[A-Za-z0-9_.-]+"
const SHORT_REF = new RegExp(`^(?:(?:(${NAME})/)?(${NAME}))?#([1-9][0-9]*)$`)

export const parseEpicChildren = (
  body: string,
  repository: RepoRef,
  forgejoUrl: string,
): ReadonlyArray<EpicReference> => {
  const base = new URL(forgejoUrl)
  const prefix = base.pathname.replace(/\/$/, "")
  const children = new Map<string, EpicReference>()
  let fence: { marker: string; length: number } | undefined
  for (const line of body.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence !== undefined) {
      if (
        marker?.[1]?.[0] === fence.marker &&
        marker[1].length >= fence.length &&
        marker[2]?.trim() === ""
      )
        fence = undefined
      continue
    }
    if (marker?.[1] !== undefined) {
      fence = { marker: marker[1][0] ?? "", length: marker[1].length }
      continue
    }
    const task = /^\s*[-*+][\t ]+\[[ xX]\]\s+(\S+)(?:\s|$)/.exec(line)
    if (task?.[1] === undefined) continue
    const target = task[1].replace(/^<(.+)>$/, "$1")
    let owner = repository.owner
    let name = repository.name
    let number: number
    const short = SHORT_REF.exec(target)
    if (short !== null) {
      owner = short[1] ?? owner
      name = short[2] ?? name
      number = Number(short[3])
    } else {
      if (!URL.canParse(target)) continue
      const url = new URL(target)
      if (url.origin !== base.origin || !url.pathname.startsWith(`${prefix}/`)) continue
      const path = url.pathname.slice(prefix.length)
      const issue = new RegExp(`^/(${NAME})/(${NAME})/issues/([1-9][0-9]*)/?$`).exec(path)
      if (issue === null) continue
      owner = issue[1] ?? owner
      name = issue[2] ?? name
      number = Number(issue[3])
    }
    if (
      !Number.isSafeInteger(number) ||
      [owner, name].some((part) => part === "." || part === "..")
    )
      continue
    owner = owner.toLowerCase()
    name = name.toLowerCase()
    const ref = `${owner}/${name}#${number}`
    children.set(ref, { owner, name, number, ref })
    if (children.size === MAX_CHILDREN) break
  }
  return [...children.values()]
}

export class EpicsConfig extends Context.Service<
  EpicsConfig,
  { readonly label: string; readonly forgejoUrl: string }
>()("tabulo/EpicsConfig") {}

const MAX_CHILD_LOOKUPS = 200
const CHILD_CONCURRENCY = 4

type RepoEpics =
  | {
      readonly _tag: "Loaded"
      readonly repo: ForgejoRepo
      readonly issues: ReadonlyArray<ForgejoEpicIssue>
    }
  | { readonly _tag: "Failed"; readonly repo: string; readonly message: string }

export const loadEpics = Effect.fn("loadEpics")(function* (
  token: AccessToken,
  query: { org: string; repos: ReadonlyArray<string> },
) {
  const settings = yield* BoardConfig
  const config = yield* EpicsConfig
  const forgejo = yield* ForgejoClient
  const layout = boardLayout(settings, yield* forgejo.orgLabels(token, query.org))
  const windowStart = (yield* Clock.currentTimeMillis) - settings.doneDays * 86_400_000
  const updatedSince = new Date(windowStart).toISOString()
  const results = yield* Effect.forEach(
    query.repos,
    (name) => {
      const ref = { owner: query.org, name }
      return Effect.all(
        [
          forgejo.repo(token, ref),
          forgejo.repoEpicIssues(token, ref, { state: "open" }),
          forgejo.repoEpicIssues(token, ref, { state: "closed", updatedSince }),
        ],
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map(
          ([repo, open, closed]): RepoEpics => ({
            _tag: "Loaded",
            repo,
            issues: [...open, ...closed],
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
            config.forgejoUrl,
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
    repo: `${ref.owner}/${ref.name}`,
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
  const resolved = new Map(
    yield* Effect.forEach(
      [...missing.values()].slice(0, MAX_CHILD_LOOKUPS),
      (ref) =>
        forgejo.issue(token, ref, ref.number).pipe(
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
  } satisfies Epics
})
