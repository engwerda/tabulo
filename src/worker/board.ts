import { Clock, Context, Effect, Exit } from "effect"
import type {
  Board,
  BoardCard,
  BoardColumn,
  BoardLabel,
  MoveCardRequest,
  MoveCardResult,
  Org,
  OrgRepo,
} from "../shared/api.ts"
import { rankForDrop } from "../shared/card-order.ts"
import { CardRanks, rankCards } from "./card-ranks.ts"
import type { BoardSettings } from "./config.ts"
import {
  BoardChanged,
  BoardRequestInvalid,
  describeForgejoError,
  FORGEJO_READ_ERRORS,
  type ForgejoError,
  ForgejoMovePartlyApplied,
  type ForgejoUnauthorized,
  MoveForbidden,
} from "./errors.ts"
import { type AccessToken, ForgejoClient, type RepoRef } from "./forgejo/client.ts"
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
  /**
   * Whether the label names a Status column. Repository-level labels count too: repositories
   * can define their own label with an organization status label's name.
   */
  readonly isColumnLabel: (label: ForgejoLabel) => boolean
  /** The column an issue belongs in, ignoring the Done window: every closed issue is Done. */
  readonly columnOf: (issue: ForgejoRepoIssue) => string
  /** The open column the issue's labels name, Todo when none does, whatever its state. */
  readonly labelColumnOf: (issue: ForgejoRepoIssue) => string
}

export const boardLayout = (
  settings: BoardSettings,
  orgLabels: ReadonlyArray<ForgejoLabel>,
): BoardLayout => {
  const statusLabels = new Map(
    orgLabels
      .filter(
        (label) =>
          label.exclusive &&
          label.is_archived !== true &&
          label.name.startsWith(settings.statusScope),
      )
      .map((label) => [label.name, label] as const),
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
  const isColumnLabel = (label: ForgejoLabel) => statusLabels.has(label.name)
  const labelColumnOf = (issue: ForgejoRepoIssue) =>
    issue.labels.find(isColumnLabel)?.name ?? TODO.key

  return {
    columns,
    column: (key) => byKey.get(key),
    isColumnLabel,
    columnOf: (issue) => (issue.state === "closed" ? DONE.key : labelColumnOf(issue)),
    labelColumnOf,
  }
}

// Forgejo matches owner and repository names without regard to case, so keys and the rank
// table do too.
export const cardKey = (org: string, repo: string, number: number) =>
  `${org}/${repo}#${number}`.toLowerCase()

type UnrankedCard = Omit<BoardCard, "rank">

export const toBoardCard = (
  layout: BoardLayout,
  org: string,
  repo: ForgejoRepo,
  issue: ForgejoRepoIssue,
): UnrankedCard => ({
  key: cardKey(org, repo.name, issue.number),
  repo: repo.name,
  number: issue.number,
  title: issue.title,
  url: issue.html_url,
  state: issue.state,
  labels: issue.labels.filter((label) => !layout.isColumnLabel(label)).map(toBoardLabel),
  assignees: (issue.assignees ?? []).map(({ login, avatar_url }) => ({
    login,
    avatarUrl: avatar_url,
  })),
  milestone: issue.milestone?.title ?? null,
  updatedAt: issue.updated_at,
  closedAt: issue.closed_at,
  column: layout.columnOf(issue),
  readOnlyReason: repo.archived ? "archived" : null,
})

const NAME = /^[A-Za-z0-9_.-]+$/
const CARD_KEY = /^[a-z0-9_.-]+\/[a-z0-9_.-]+#[1-9][0-9]*$/
const MAX_CARD_KEY_LENGTH = 200

/** A card key of `org` from a request, lowercased, or null when the request names none. */
export const parseCardKey = (org: string, what: string, value: string | null) => {
  if (value === null) return Effect.succeed(null)
  const key = value.toLowerCase()
  return key.length <= MAX_CARD_KEY_LENGTH && CARD_KEY.test(key) && key.startsWith(`${org}/`)
    ? Effect.succeed(key)
    : Effect.fail(new BoardRequestInvalid({ message: `${what} is not a card of ${org}` }))
}

/** An organization or repository name that is safe to put in a Forgejo API path. */
export const parseName = (what: string, value: string | undefined) =>
  value !== undefined && NAME.test(value) && value !== "." && value !== ".."
    ? Effect.succeed(value.toLowerCase())
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
            archived: repo.archived,
          }),
        )
        .sort((a, b) => byName(a.name, b.name)),
    ),
  )

type RepoCards =
  | { readonly _tag: "Loaded"; readonly repo: string; readonly cards: ReadonlyArray<UnrankedCard> }
  | { readonly _tag: "Failed"; readonly repo: string; readonly message: string }

/**
 * Reads the board as the user who owns `token`. A repository that fails to load is reported in
 * `failedRepos`; only an auth failure or a failure to read the organization's labels escapes.
 */
export const loadBoard = (
  token: AccessToken,
  login: string,
  query: { org: string; repos: ReadonlyArray<string> },
) =>
  Effect.gen(function* () {
    const settings = yield* BoardConfig
    const forgejo = yield* ForgejoClient
    const [orgLabels, viewerCanArrange] = yield* Effect.all(
      [forgejo.orgLabels(token, query.org), forgejo.isOrgMember(token, query.org, login)],
      { concurrency: "unbounded" },
    )
    const layout = boardLayout(settings, orgLabels)
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
            repo: name,
            cards: [...open, ...closed.filter(closedInWindow)].map((issue) =>
              toBoardCard(layout, query.org, repo, issue),
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

    const readStartedAt = yield* Clock.currentTimeMillis
    const results = yield* Effect.forEach(query.repos, repoCards, {
      concurrency: REPO_CONCURRENCY,
    })
    const loaded = results.flatMap((result) => (result._tag === "Loaded" ? [result] : []))
    const ranks = yield* CardRanks
    const stored = yield* ranks.forOrg(query.org)
    const { kept, fresh } = rankCards(
      stored,
      loaded.flatMap((result) => result.cards),
    )
    // Rows of issues that a loaded repository no longer lists: closed before the Done window,
    // deleted, or transferred. Rows of other repositories belong to other boards.
    const listed = new Set([...kept, ...fresh].map((card) => card.key))
    const loadedRepos = new Set(loaded.map((result) => result.repo))
    const removed = [...stored.keys()].filter(
      (key) =>
        !listed.has(key) && loadedRepos.has(key.slice(query.org.length + 1, key.lastIndexOf("#"))),
    )
    yield* ranks.materialize(
      query.org,
      fresh.map(({ key, column, rank }) => ({ key, column, rank })),
      removed,
      login,
      readStartedAt,
    )
    return {
      org: query.org,
      repos: query.repos,
      viewerCanArrange,
      columns: layout.columns,
      cards: [...kept, ...fresh],
      failedRepos: results.flatMap((result) =>
        result._tag === "Failed" ? [{ repo: result.repo, message: result.message }] : [],
      ),
    } satisfies Board
  })

/** One Forgejo write of a move, given the issue as the previous write left it. */
type IssueWrite = (
  issue: ForgejoRepoIssue,
) => Effect.Effect<ForgejoRepoIssue, ForgejoError, ForgejoClient>

/**
 * The Forgejo writes that put the issue in `target`. Labels are added or removed one at a time,
 * never replaced as a set, so labels changed in Forgejo since Tabulo read the issue survive.
 */
const columnWrites = (
  token: AccessToken,
  layout: BoardLayout,
  repo: RepoRef,
  issue: ForgejoRepoIssue,
  target: BoardColumn,
): ReadonlyArray<IssueWrite> => {
  const setState =
    (state: "open" | "closed"): IssueWrite =>
    (current) =>
      ForgejoClient.use((forgejo) => forgejo.setIssueState(token, repo, current.number, state))
  if (target._tag === "Done") return [setState("closed")]
  const labelWrites: ReadonlyArray<IssueWrite> =
    layout.labelColumnOf(issue) === target.key
      ? []
      : target._tag === "Status"
        ? [
            (current) =>
              ForgejoClient.use((forgejo) =>
                forgejo.addIssueLabels(token, repo, current.number, [target.label.id]),
              ).pipe(Effect.map((labels) => ({ ...current, labels }))),
          ]
        : issue.labels.filter(layout.isColumnLabel).map(
            (label): IssueWrite =>
              (current) =>
                ForgejoClient.use((forgejo) =>
                  forgejo.removeIssueLabel(token, repo, current.number, label.id),
                ).pipe(
                  Effect.as({
                    ...current,
                    labels: current.labels.filter((other) => other.id !== label.id),
                  }),
                ),
          )
  return issue.state === "closed" ? [...labelWrites, setState("open")] : labelWrites
}

/**
 * Runs the writes in order and returns the issue as the last one left it. A failure after an
 * earlier write succeeded becomes ForgejoMovePartlyApplied, because Forgejo keeps that write.
 */
const applyWrites = (issue: ForgejoRepoIssue, writes: ReadonlyArray<IssueWrite>) =>
  Effect.gen(function* () {
    let current = issue
    for (const [index, write] of writes.entries()) {
      current = yield* index === 0
        ? write(current)
        : write(current).pipe(
            Effect.mapError(
              (error) => new ForgejoMovePartlyApplied({ reason: describeForgejoError(error) }),
            ),
          )
    }
    return current
  })

/**
 * Moves a card as the user who owns `token`: changes the issue's state and status label in
 * Forgejo when the column changes, then stores the card's rank directly after `afterKey`.
 * Only organization members may arrange cards, and never those of an archived repository;
 * Forgejo decides each issue write. No rank is stored if a Forgejo write fails.
 */
export const moveCard = (token: AccessToken, login: string, request: MoveCardRequest) =>
  Effect.gen(function* () {
    const org = yield* parseName("org", request.org)
    const repoRef = { owner: org, name: yield* parseName("repository", request.repo) }
    const movedKey = cardKey(org, repoRef.name, request.number)
    const afterKey = yield* parseCardKey(org, "afterKey", request.afterKey)
    const beforeKey = yield* parseCardKey(org, "beforeKey", request.beforeKey)
    if (
      afterKey === movedKey ||
      beforeKey === movedKey ||
      (afterKey !== null && afterKey === beforeKey)
    ) {
      return yield* new BoardRequestInvalid({
        message: "afterKey and beforeKey must name two other cards",
      })
    }

    const settings = yield* BoardConfig
    const forgejo = yield* ForgejoClient
    if (!(yield* forgejo.isOrgMember(token, org, login))) {
      return yield* new MoveForbidden({ message: `Only members of ${org} can arrange its board` })
    }
    const [repo, issue, orgLabels] = yield* Effect.all(
      [
        forgejo.repo(token, repoRef),
        forgejo.issue(token, repoRef, request.number),
        forgejo.orgLabels(token, org),
      ],
      { concurrency: "unbounded" },
    )
    if (issue.pull_request != null) {
      return yield* new BoardRequestInvalid({ message: "Pull requests are not on the board" })
    }
    if (repo.archived) {
      return yield* new MoveForbidden({
        message: `${repo.full_name} is archived, so its issues cannot be moved`,
      })
    }
    const layout = boardLayout(settings, orgLabels)
    const target = layout.column(request.toColumn)
    if (target === undefined) {
      return yield* new BoardRequestInvalid({ message: `There is no column ${request.toColumn}` })
    }

    // A card that left the column the client saw was moved by someone else; acting on the
    // stale view would undo their status change in Forgejo.
    if (layout.columnOf(issue) !== request.fromColumn) return yield* new BoardChanged()

    const ranks = yield* CardRanks
    const rank = rankForDrop(yield* ranks.forOrg(org), {
      movedKey,
      column: target.key,
      afterKey,
      beforeKey,
    })
    if (rank === undefined) return yield* new BoardChanged()

    const moved =
      layout.columnOf(issue) === target.key
        ? issue
        : yield* applyWrites(issue, columnWrites(token, layout, repoRef, issue, target))

    const saved = yield* Effect.exit(
      ranks.place(org, { key: movedKey, column: target.key, rank }, login),
    )
    if (Exit.isFailure(saved)) console.error(`Storing the rank of ${movedKey} failed`, saved.cause)
    return {
      card: { ...toBoardCard(layout, org, repo, moved), rank },
      orderSaved: Exit.isSuccess(saved),
    } satisfies MoveCardResult
  })
