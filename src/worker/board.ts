import { Clock, Context, Effect } from "effect"
import type { Board, BoardCard, BoardColumn, BoardLabel, Org, OrgRepo } from "../shared/api.ts"
import type { BoardSettings } from "./config.ts"
import {
  BoardRequestInvalid,
  describeForgejoError,
  FORGEJO_READ_ERRORS,
  type ForgejoUnauthorized,
} from "./errors.ts"
import { type AccessToken, ForgejoClient } from "./forgejo/client.ts"
import {
  type ForgejoLabel,
  type ForgejoRepo,
  type ForgejoRepoIssue,
  labelHexColor,
} from "./forgejo/schemas.ts"

export class BoardConfig extends Context.Service<BoardConfig, BoardSettings>()(
  "tabulo/BoardConfig",
) {}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_BOARD_REPOS = 20
// Each repository needs three Forgejo reads at once; Workers allow six open connections.
const REPO_CONCURRENCY = 2

const TODO = { _tag: "Todo", key: "todo", title: "Todo" } as const satisfies BoardColumn
const DONE = { _tag: "Done", key: "done", title: "Done" } as const satisfies BoardColumn

const byName = new Intl.Collator("en").compare

const toBoardLabel = ({ id, name, color }: ForgejoLabel): BoardLabel => ({
  id,
  name,
  color: labelHexColor(color),
})

/** The columns of a board and the one rule that puts an issue in a column. */
export type BoardLayout = {
  readonly columns: ReadonlyArray<BoardColumn>
  readonly column: (key: string) => BoardColumn | undefined
  readonly isStatusLabel: (label: ForgejoLabel) => boolean
  /** The column an issue belongs in, ignoring the Done window: every closed issue is Done. */
  readonly columnOf: (issue: ForgejoRepoIssue) => string
}

export const boardLayout = (
  settings: BoardSettings,
  orgLabels: ReadonlyArray<ForgejoLabel>,
): BoardLayout => {
  const isStatusLabel = (label: ForgejoLabel) =>
    label.exclusive && label.name.startsWith(settings.statusScope)
  const statusLabels = new Map(
    orgLabels.filter(isStatusLabel).map((label) => [label.name, label] as const),
  )

  type Slot =
    | { readonly _tag: "Todo" }
    | { readonly _tag: "Done" }
    | { readonly _tag: "Status"; readonly label: ForgejoLabel }
  const slots: Array<Slot> = settings.columnOrder.flatMap((ref): Array<Slot> => {
    if (ref._tag !== "Status") return [ref]
    const label = statusLabels.get(ref.name)
    return label === undefined ? [] : [{ _tag: "Status", label }]
  })
  if (!slots.some((slot) => slot._tag === "Todo")) slots.unshift({ _tag: "Todo" })
  if (!slots.some((slot) => slot._tag === "Done")) slots.push({ _tag: "Done" })
  const listed = new Set(slots.flatMap((slot) => (slot._tag === "Status" ? [slot.label] : [])))
  const unlisted = [...statusLabels.values()]
    .filter((label) => !listed.has(label))
    .sort((a, b) => byName(a.name, b.name))
    .map((label): Slot => ({ _tag: "Status", label }))
  slots.splice(
    slots.findIndex((slot) => slot._tag === "Done"),
    0,
    ...unlisted,
  )

  const columns = slots.map((slot): BoardColumn => {
    if (slot._tag === "Todo") return TODO
    if (slot._tag === "Done") return DONE
    return {
      _tag: "Status",
      key: slot.label.name,
      title: slot.label.name.slice(settings.statusScope.length),
      label: toBoardLabel(slot.label),
    }
  })
  const byKey = new Map(columns.map((column) => [column.key, column] as const))

  return {
    columns,
    column: (key) => byKey.get(key),
    isStatusLabel,
    columnOf: (issue) => {
      if (issue.state === "closed") return DONE.key
      const status = issue.labels.find((label) => isStatusLabel(label) && byKey.has(label.name))
      return status?.name ?? TODO.key
    },
  }
}

export const cardKey = (org: string, repo: string, number: number) => `${org}/${repo}#${number}`

export const canWrite = (repo: ForgejoRepo) =>
  repo.permissions !== undefined && (repo.permissions.push || repo.permissions.admin)

export const toBoardCard = (
  layout: BoardLayout,
  org: string,
  repo: ForgejoRepo,
  issue: ForgejoRepoIssue,
  rank: string | null,
): BoardCard => ({
  key: cardKey(org, repo.name, issue.number),
  repo: repo.name,
  number: issue.number,
  title: issue.title,
  url: issue.html_url,
  state: issue.state,
  labels: issue.labels.filter((label) => !layout.isStatusLabel(label)).map(toBoardLabel),
  assignees: (issue.assignees ?? []).map(({ login, avatar_url }) => ({
    login,
    avatarUrl: avatar_url,
  })),
  milestone: issue.milestone?.title ?? null,
  updatedAt: issue.updated_at,
  closedAt: issue.closed_at,
  column: layout.columnOf(issue),
  rank,
  canWrite: canWrite(repo),
})

const NAME = /^[A-Za-z0-9_.-]+$/

/** An organization or repository name that is safe to put in a Forgejo API path. */
export const parseName = (what: string, value: string | undefined) =>
  value !== undefined && NAME.test(value) && value !== "." && value !== ".."
    ? Effect.succeed(value)
    : Effect.fail(new BoardRequestInvalid({ message: `${what} is not a valid name` }))

export const parseBoardQuery = (org: string | undefined, repos: string | undefined) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.forEach(
      (repos ?? "").split(",").filter((name) => name !== ""),
      (name) => parseName("repository", name),
    )
    const names = [...new Set(parsed)]
    if (names.length === 0) {
      return yield* new BoardRequestInvalid({ message: "Choose at least one repository" })
    }
    if (names.length > MAX_BOARD_REPOS) {
      return yield* new BoardRequestInvalid({
        message: `A board shows at most ${MAX_BOARD_REPOS} repositories`,
      })
    }
    return { org: yield* parseName("org", org), repos: names }
  })

export const listOrgs = (token: AccessToken) =>
  ForgejoClient.use((forgejo) => forgejo.userOrgs(token)).pipe(
    Effect.map((orgs) =>
      orgs.map(
        (org): Org => ({ name: org.name, fullName: org.full_name, avatarUrl: org.avatar_url }),
      ),
    ),
  )

export const listOrgRepos = (token: AccessToken, org: string) =>
  ForgejoClient.use((forgejo) => forgejo.orgRepos(token, org)).pipe(
    Effect.map((repos) =>
      repos
        .map(
          (repo): OrgRepo => ({
            name: repo.name,
            fullName: repo.full_name,
            private: repo.private,
            canWrite: canWrite(repo),
          }),
        )
        .sort((a, b) => byName(a.name, b.name)),
    ),
  )

type RepoCards =
  | { readonly _tag: "Loaded"; readonly cards: ReadonlyArray<BoardCard> }
  | { readonly _tag: "Failed"; readonly repo: string; readonly message: string }

/**
 * Reads the board as the user who owns `token`. A repository that fails to load is reported in
 * `failedRepos`; only an auth failure or a failure to read the organization's labels escapes.
 */
export const loadBoard = (
  token: AccessToken,
  query: { org: string; repos: ReadonlyArray<string> },
) =>
  Effect.gen(function* () {
    const settings = yield* BoardConfig
    const forgejo = yield* ForgejoClient
    const layout = boardLayout(settings, yield* forgejo.orgLabels(token, query.org))
    const windowStart = (yield* Clock.currentTimeMillis) - settings.doneDays * DAY_MS
    const updatedSince = new Date(windowStart).toISOString()
    // `since` filters by update time; an issue closed long ago may have been updated since.
    const closedInWindow = (issue: ForgejoRepoIssue) =>
      issue.closed_at !== null && Date.parse(issue.closed_at) >= windowStart

    const repoCards = (name: string): Effect.Effect<RepoCards, ForgejoUnauthorized> => {
      const ref = { owner: query.org, name }
      return Effect.all(
        [
          forgejo.repo(token, ref),
          forgejo.repoIssues(token, ref, { state: "open" }),
          forgejo.repoIssues(token, ref, { state: "closed", updatedSince }),
        ],
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map(
          ([repo, open, closed]): RepoCards => ({
            _tag: "Loaded",
            cards: [...open, ...closed.filter(closedInWindow)].map((issue) =>
              toBoardCard(layout, query.org, repo, issue, null),
            ),
          }),
        ),
        Effect.catchTag(FORGEJO_READ_ERRORS, (error) =>
          Effect.sync((): RepoCards => {
            console.warn(`Board repository ${query.org}/${name} failed`, error)
            return { _tag: "Failed", repo: name, message: describeForgejoError(error) }
          }),
        ),
      )
    }

    const results = yield* Effect.forEach(query.repos, repoCards, {
      concurrency: REPO_CONCURRENCY,
    })
    return {
      org: query.org,
      repos: query.repos,
      columns: layout.columns,
      cards: results.flatMap((result) => (result._tag === "Loaded" ? result.cards : [])),
      failedRepos: results.flatMap((result) =>
        result._tag === "Failed" ? [{ repo: result.repo, message: result.message }] : [],
      ),
    } satisfies Board
  })
