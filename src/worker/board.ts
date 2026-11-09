import { Clock, Context, Effect, Exit } from "effect"
import type {
  AddCommentRequest,
  AddCommentResult,
  Board,
  BoardCard,
  BoardColumn,
  BoardLabel,
  CardComment,
  CardDetail,
  CardUpdateResult,
  CreateCardRequest,
  CreateCardResult,
  IssueOptions,
  MoveCardRequest,
  MoveCardResult,
  Org,
  OrgRepo,
  SetAssigneeRequest,
  SetLabelRequest,
  SetMilestoneRequest,
} from "../shared/api.ts"
import { rankForDrop } from "../shared/card-order.ts"
import { CardRanks, rankCards, rankOf, topRank } from "./card-ranks.ts"
import type { BoardSettings } from "./config.ts"
import {
  BoardChanged,
  BoardRequestInvalid,
  BoardWriteForbidden,
  describeForgejoError,
  FORGEJO_READ_ERRORS,
  type ForgejoError,
  ForgejoForbidden,
  ForgejoMovePartlyApplied,
  type ForgejoUnauthorized,
  PageBudgetExhausted,
} from "./errors.ts"
import { type AccessToken, ForgejoClient, type PageBudget, type RepoRef } from "./forgejo/client.ts"
import {
  type ForgejoComment,
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

/** What a board decides about its columns, as column keys: their order and the ones it hides. */
export type ColumnPlan = {
  readonly columns: ReadonlyArray<string>
  readonly hidden: ReadonlyArray<string>
}

/**
 * The plan of moves, new issues, card edits, and issue options. They name no board: they need
 * which columns exist and where an issue is, never a board's order or what it hides.
 */
export const UNORDERED: ColumnPlan = { columns: [], hidden: [] }

/** The columns of a board and the one rule that puts an issue in a column. */
export type BoardLayout = {
  /** Every column, in the plan's order, hidden ones included. */
  readonly columns: ReadonlyArray<BoardColumn>
  /** The keys of the plan's hidden columns that exist. */
  readonly hidden: ReadonlySet<string>
  readonly column: (key: string) => BoardColumn | undefined
  /**
   * Whether the label names a Status column. Repository-level labels count too: repositories
   * can define their own label with an organization status label's name.
   */
  readonly isColumnLabel: (label: ForgejoLabel) => boolean
  /**
   * The column an issue belongs in, ignoring the Done window: every closed issue is Done. A
   * hidden column is still the issue's column, so its card keeps its rank.
   */
  readonly columnOf: (issue: ForgejoRepoIssue) => string
  /** The open column the issue's labels name, Todo when none does, whatever its state. */
  readonly labelColumnOf: (issue: ForgejoRepoIssue) => string
}

export const boardLayout = (
  statusScope: string,
  orgLabels: ReadonlyArray<ForgejoLabel>,
  plan: ColumnPlan,
): BoardLayout => {
  const statusLabels = new Map(
    orgLabels
      .filter(
        (label) =>
          label.exclusive && label.is_archived !== true && label.name.startsWith(statusScope),
      )
      .map((label) => [label.name, label] as const),
  )

  type Slot =
    | { readonly _tag: "Todo" }
    | { readonly _tag: "Done" }
    | { readonly _tag: "Status"; readonly label: ForgejoLabel }
  // A key the organization has no column for is skipped, so a label removed in Forgejo leaves
  // the board without breaking it.
  const slots: Array<Slot> = plan.columns.flatMap((key): Array<Slot> => {
    if (key === TODO.key) return [{ _tag: "Todo" }]
    if (key === DONE.key) return [{ _tag: "Done" }]
    const label = statusLabels.get(key)
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
      title: slot.label.name.slice(statusScope.length),
      label: toBoardLabel(slot.label),
    }
  })
  const byKey = new Map(columns.map((column) => [column.key, column] as const))
  const isColumnLabel = (label: ForgejoLabel) => statusLabels.has(label.name)
  const labelColumnOf = (issue: ForgejoRepoIssue) =>
    issue.labels.find(isColumnLabel)?.name ?? TODO.key

  return {
    columns,
    hidden: new Set(plan.hidden.filter((key) => byKey.has(key))),
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
  author: { login: issue.user.login, avatarUrl: issue.user.avatar_url },
  comments: issue.comments,
  createdAt: issue.created_at,
  updatedAt: issue.updated_at,
  closedAt: issue.closed_at,
  column: layout.columnOf(issue),
  readOnlyReason: repo.archived ? "archived" : null,
})

const NAME = /^[A-Za-z0-9_.-]{1,100}$/
const isName = (value: string) => NAME.test(value) && value !== "." && value !== ".."
const CARD_KEY = /^([^/]+)\/([^#]+)#([1-9][0-9]{0,9})$/
const MAX_CARD_KEY_LENGTH = 200

const cardIssue = (key: string) => {
  const [, owner, name, number] = CARD_KEY.exec(key) ?? []
  return owner !== undefined && name !== undefined && isName(owner) && isName(name)
    ? { repo: { owner, name }, number: Number(number) }
    : undefined
}

/** A card key of `org` from a request, lowercased, or null when the request names none. */
export const parseCardKey = (org: string, what: string, value: string | null) => {
  if (value === null) return Effect.succeed(null)
  const key = value.toLowerCase()
  return key.length <= MAX_CARD_KEY_LENGTH &&
    cardIssue(key) !== undefined &&
    key.startsWith(`${org}/`)
    ? Effect.succeed(key)
    : Effect.fail(new BoardRequestInvalid({ message: `${what} is not a card of ${org}` }))
}

/** An organization or repository name that is safe to put in a Forgejo API path. */
export const parseName = (what: string, value: string | undefined) =>
  value !== undefined && isName(value)
    ? Effect.succeed(value.toLowerCase())
    : Effect.fail(new BoardRequestInvalid({ message: `${what} is not a valid name` }))

/** A Forgejo login, kept in the case the request gives. */
const parseLogin = (value: string) =>
  isName(value)
    ? Effect.succeed(value)
    : Effect.fail(new BoardRequestInvalid({ message: "login is not a valid login" }))

const ISSUE_NUMBER = /^[1-9][0-9]{0,9}$/

/** The repository a request names. */
export const parseRepoQuery = (org: string | undefined, repo: string | undefined) =>
  Effect.gen(function* () {
    return { owner: yield* parseName("org", org), name: yield* parseName("repository", repo) }
  })

/** The issue a card detail request names. */
export const parseCardQuery = (
  org: string | undefined,
  repo: string | undefined,
  number: string | undefined,
) =>
  Effect.gen(function* () {
    const ref = yield* parseRepoQuery(org, repo)
    if (number === undefined || !ISSUE_NUMBER.test(number)) {
      return yield* new BoardRequestInvalid({ message: "number is not an issue number" })
    }
    return { repo: ref, number: Number(number) }
  })

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
        message: `Choose at most ${MAX_BOARD_REPOS} repositories`,
      })
    }
    return { org: yield* parseName("org", org), repos: names }
  })

const isOrgMember = (token: AccessToken, org: string) =>
  ForgejoClient.use((forgejo) => forgejo.userOrgs(token)).pipe(
    Effect.map((orgs) => orgs.some(({ name }) => name.toLowerCase() === org)),
  )

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
  | {
      readonly _tag: "Loaded"
      readonly repo: string
      readonly cards: ReadonlyArray<UnrankedCard>
      readonly complete: boolean
    }
  | { readonly _tag: "Failed"; readonly repo: string; readonly message: string }

/**
 * Every label of the organization, read from `budget` (100 pages by default). Fails rather than
 * return part of them, because columns and label writes depend on all of them.
 */
export const readOrgLabels = (token: AccessToken, org: string, budget?: PageBudget) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const labels = yield* forgejo.orgLabels(token, org, budget)
    if (!labels.complete) return yield* new PageBudgetExhausted()
    return labels.items
  })

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
      [readOrgLabels(token, query.org), isOrgMember(token, query.org)],
      { concurrency: "unbounded" },
    )
    const layout = boardLayout(settings.statusScope, orgLabels, {
      columns: settings.defaultColumns,
      hidden: [],
    })
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
            cards: [...open.items, ...closed.items.filter(closedInWindow)].map((issue) =>
              toBoardCard(layout, query.org, repo, issue),
            ),
            complete: open.complete && closed.complete,
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
    const listed = new Set([...kept, ...fresh].map((card) => card.key))
    const fullyListedRepos = new Set(
      loaded.flatMap((result) => (result.complete ? [result.repo] : [])),
    )
    const removed = [...stored.keys()].filter(
      (key) => !listed.has(key) && fullyListedRepos.has(cardIssue(key)?.repo.name ?? ""),
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

/**
 * The identifier that removes `label` from an issue: an organization label's name, a
 * repository label's id. A repository label with the same name shadows an organization label,
 * and Forgejo then removes nothing.
 */
const labelIdentifier = (orgLabels: ReadonlyArray<ForgejoLabel>, label: ForgejoLabel) =>
  orgLabels.some((orgLabel) => orgLabel.id === label.id) ? label.name : String(label.id)

/** One Forgejo write of a move, given the issue as the previous write left it. */
type IssueWrite = (
  issue: ForgejoRepoIssue,
) => Effect.Effect<ForgejoRepoIssue, ForgejoError | ForgejoMovePartlyApplied, ForgejoClient>

/** A step that runs after a write Forgejo already applied: its failure leaves the move half done. */
const afterApplied = <A, R>(step: Effect.Effect<A, ForgejoError, R>) =>
  step.pipe(
    Effect.mapError(
      (error) => new ForgejoMovePartlyApplied({ reason: describeForgejoError(error) }),
    ),
  )

/**
 * The Forgejo writes that put the issue in `target`. Labels are added or removed one at a time,
 * never replaced as a set, so labels changed in Forgejo since Tabulo read the issue survive.
 */
const columnWrites = (
  token: AccessToken,
  layout: BoardLayout,
  orgLabels: ReadonlyArray<ForgejoLabel>,
  repo: RepoRef,
  issue: ForgejoRepoIssue,
  target: BoardColumn,
): ReadonlyArray<IssueWrite> => {
  const setState =
    (state: "open" | "closed"): IssueWrite =>
    (current) =>
      ForgejoClient.use((forgejo) => forgejo.setIssueState(token, repo, current.number, state))
  const readBack = (number: number) =>
    ForgejoClient.use((forgejo) => forgejo.issue(token, repo, number))
  const remove = (number: number, label: ForgejoLabel) =>
    ForgejoClient.use((forgejo) =>
      forgejo.removeIssueLabel(token, repo, number, labelIdentifier(orgLabels, label)),
    )
  // Forgejo answers 204 even when a repository label of the same name shadows the organization's
  // and nothing is removed, so the issue is read back, and a label still there is a refusal.
  const removeColumnLabel =
    (label: ForgejoLabel): IssueWrite =>
    (current) =>
      remove(current.number, label).pipe(
        Effect.andThen(afterApplied(readBack(current.number))),
        Effect.flatMap((after) =>
          after.labels.some((other) => other.id === label.id)
            ? Effect.fail(new ForgejoForbidden())
            : Effect.succeed(after),
        ),
      )
  // Adding a status label makes Forgejo drop the others only in its exclusive scope; a
  // repository's non-exclusive label with a column's name stays and is removed here.
  const addColumnLabel =
    (label: BoardLabel): IssueWrite =>
    (current) =>
      ForgejoClient.use((forgejo) =>
        forgejo.addIssueLabels(token, repo, current.number, [label.id]),
      ).pipe(
        Effect.flatMap((labels) => {
          const leftovers = labels.filter(
            (other) => layout.isColumnLabel(other) && other.name !== label.name,
          )
          return leftovers.length === 0
            ? Effect.succeed({ ...current, labels })
            : afterApplied(
                Effect.forEach(leftovers, (other) => remove(current.number, other), {
                  discard: true,
                }).pipe(Effect.andThen(readBack(current.number))),
              )
        }),
      )
  if (target._tag === "Done") return [setState("closed")]
  const labelWrites: ReadonlyArray<IssueWrite> =
    layout.labelColumnOf(issue) === target.key
      ? []
      : target._tag === "Status"
        ? [addColumnLabel(target.label)]
        : issue.labels.filter(layout.isColumnLabel).map(removeColumnLabel)
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
            Effect.mapError((error) =>
              error._tag === "ForgejoMovePartlyApplied"
                ? error
                : new ForgejoMovePartlyApplied({ reason: describeForgejoError(error) }),
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

    const forgejo = yield* ForgejoClient
    if (!(yield* isOrgMember(token, org))) {
      return yield* new BoardWriteForbidden({
        message: `Only members of ${org} can arrange its board`,
      })
    }
    const canRead = (key: string | null) => {
      const neighbour = key === null ? undefined : cardIssue(key)
      return neighbour === undefined
        ? Effect.succeed(true)
        : forgejo.issue(token, neighbour.repo, neighbour.number).pipe(
            Effect.as(true),
            Effect.catchTag(["ForgejoNotFound", "ForgejoForbidden"], () => Effect.succeed(false)),
          )
    }
    const [repo, issue, orgLabels, neighboursReadable] = yield* Effect.all(
      [
        forgejo.repo(token, repoRef),
        forgejo.issue(token, repoRef, request.number),
        readOrgLabels(token, org),
        Effect.all([canRead(afterKey), canRead(beforeKey)], { concurrency: "unbounded" }).pipe(
          Effect.map((readable) => readable.every(Boolean)),
        ),
      ],
      { concurrency: "unbounded" },
    )
    const layout = boardLayout((yield* BoardConfig).statusScope, orgLabels, UNORDERED)
    if (issue.pull_request != null) {
      return yield* new BoardRequestInvalid({ message: "Pull requests are not on the board" })
    }
    if (repo.archived) {
      return yield* new BoardWriteForbidden({
        message: `${repo.full_name} is archived, so its issues cannot be moved`,
      })
    }
    const target = layout.column(request.toColumn)
    if (target === undefined) {
      return yield* new BoardRequestInvalid({ message: `There is no column ${request.toColumn}` })
    }

    // A card that left the column the client saw was moved by someone else; acting on the
    // stale view would undo their status change in Forgejo.
    if (layout.columnOf(issue) !== request.fromColumn) return yield* new BoardChanged()
    if (!neighboursReadable) return yield* new BoardChanged()

    const ranks = yield* CardRanks
    const rank = rankForDrop(yield* ranks.forOrg(org), {
      movedKey,
      column: target.key,
      afterKey,
      beforeKey,
    })
    if (rank === undefined) return yield* new BoardChanged()

    // Forgejo removes a label by name, and a repository label of the same name wins over the
    // organization's, so removing the organization's status label would remove nothing, or the
    // repository's label instead. Such a move to Todo is refused before anything is written.
    if (target._tag === "Todo" && layout.columnOf(issue) !== target.key) {
      const orgColumnLabels = issue.labels.filter(
        (label) => layout.isColumnLabel(label) && orgLabels.some((org) => org.id === label.id),
      )
      if (orgColumnLabels.length > 0) {
        const repoLabels = yield* forgejo.repoLabels(token, repoRef)
        const shadowed = orgColumnLabels.find((label) =>
          repoLabels.some((own) => own.name === label.name),
        )
        if (shadowed !== undefined) {
          return yield* new BoardWriteForbidden({
            message: `${repo.full_name} has its own label named ${shadowed.name}, which hides the organization's, so Tabulo cannot remove it. Rename one of them in Forgejo`,
          })
        }
      }
    }

    const moved =
      layout.columnOf(issue) === target.key
        ? issue
        : yield* applyWrites(issue, columnWrites(token, layout, orgLabels, repoRef, issue, target))
    // Forgejo can leave a label in place without an error; storing a rank for a column the
    // issue is not in would show the card there until the next board read.
    if (layout.columnOf(moved) !== target.key) {
      // Only column labels count: someone may have changed other labels meanwhile.
      const labelsOf = (candidate: ForgejoRepoIssue) =>
        candidate.labels
          .filter(layout.isColumnLabel)
          .map((label) => label.id)
          .sort()
          .join(",")
      return yield* moved.state === issue.state && labelsOf(moved) === labelsOf(issue)
        ? new ForgejoForbidden()
        : new ForgejoMovePartlyApplied({
            reason: `the issue is still in ${layout.column(layout.columnOf(moved))?.title ?? "another column"}`,
          })
    }

    const saved = yield* Effect.exit(
      ranks.place(org, { key: movedKey, column: target.key, rank }, login),
    )
    if (Exit.isFailure(saved)) console.error(`Storing the rank of ${movedKey} failed`, saved.cause)
    return {
      card: { ...toBoardCard(layout, org, repo, moved), rank },
      orderSaved: Exit.isSuccess(saved),
    } satisfies MoveCardResult
  })

/**
 * Creates an issue in the column as the user who owns `token`, then stores its rank at the top
 * of the column it landed in. Forgejo drops the status label when the user cannot write the
 * repository's issues, and the card then lands in Todo.
 */
export const createCard = (token: AccessToken, login: string, request: CreateCardRequest) =>
  Effect.gen(function* () {
    const org = yield* parseName("org", request.org)
    const repoRef = { owner: org, name: yield* parseName("repository", request.repo) }
    const settings = yield* BoardConfig
    const forgejo = yield* ForgejoClient
    if (!(yield* isOrgMember(token, org))) {
      return yield* new BoardWriteForbidden({
        message: `Only members of ${org} can add cards to its board`,
      })
    }
    const [repo, orgLabels] = yield* Effect.all(
      [forgejo.repo(token, repoRef), readOrgLabels(token, org)],
      { concurrency: "unbounded" },
    )
    if (repo.archived) {
      return yield* new BoardWriteForbidden({
        message: `${repo.full_name} is archived, so it takes no new issues`,
      })
    }
    const layout = boardLayout(settings.statusScope, orgLabels, UNORDERED)
    if (request.column === DONE.key) {
      return yield* new BoardRequestInvalid({ message: "A new card cannot start in Done" })
    }
    // Todo and Done always exist, so an unknown column is a status label removed since the
    // user's board was loaded.
    const column = layout.column(request.column)
    if (column === undefined) return yield* new BoardChanged()

    const ranks = yield* CardRanks
    const stored = yield* ranks.forOrg(org)
    const created = yield* forgejo.createIssue(token, repoRef, {
      title: request.title,
      labelIds: column._tag === "Status" ? [column.label.id] : [],
    })
    const card = toBoardCard(layout, org, repo, created)
    const rank = topRank(stored, card.column)
    const saved = yield* Effect.exit(
      ranks.place(org, { key: card.key, column: card.column, rank }, login),
    )
    if (Exit.isFailure(saved)) console.error(`Storing the rank of ${card.key} failed`, saved.cause)
    return {
      card: { ...card, rank },
      orderSaved: Exit.isSuccess(saved),
    } satisfies CreateCardResult
  })

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

type IssueRequest = { readonly org: string; readonly repo: string; readonly number: number }

/**
 * Reads the repository and issue a card edit names. Refuses a pull request and an issue of an
 * archived repository before anything is written.
 */
const editableIssue = (token: AccessToken, repoRef: RepoRef, number: number) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const [repo, issue] = yield* Effect.all(
      [forgejo.repo(token, repoRef), forgejo.issue(token, repoRef, number)],
      { concurrency: "unbounded" },
    )
    if (issue.pull_request != null) {
      return yield* new BoardRequestInvalid({ message: "Pull requests are not on the board" })
    }
    if (repo.archived) {
      return yield* new BoardWriteForbidden({
        message: `${repo.full_name} is archived, so its issues cannot be changed`,
      })
    }
    return { repo, issue }
  })

/** One change to an issue's labels, milestone, or assignees. */
type CardEdit = {
  /** Whether the issue is as the request asks. */
  readonly isApplied: (issue: ForgejoRepoIssue) => boolean
  /** The Forgejo write that makes it so; it answers with the issue after the write. */
  readonly write: (
    issue: ForgejoRepoIssue,
  ) => Effect.Effect<ForgejoRepoIssue, ForgejoError, ForgejoClient>
}

/**
 * Applies one card edit as the user who owns `token` and answers with the card as the board
 * shows it. Nothing is written when the issue is already as the request asks. Forgejo decides
 * whether the user may make the change, and ignores some writes without an error when not;
 * an issue that is still not as asked after the write answers ForgejoForbidden.
 */
const editCard = <E>(
  token: AccessToken,
  request: IssueRequest,
  plan: (context: {
    readonly repoRef: RepoRef
    readonly issue: ForgejoRepoIssue
    readonly layout: BoardLayout
    readonly orgLabels: ReadonlyArray<ForgejoLabel>
  }) => Effect.Effect<CardEdit, E, ForgejoClient>,
) =>
  Effect.gen(function* () {
    const repoRef = yield* parseRepoQuery(request.org, request.repo)
    const org = repoRef.owner
    const settings = yield* BoardConfig
    const [{ repo, issue }, orgLabels] = yield* Effect.all(
      [editableIssue(token, repoRef, request.number), readOrgLabels(token, org)],
      { concurrency: "unbounded" },
    )
    const layout = boardLayout(settings.statusScope, orgLabels, UNORDERED)
    const edit = yield* plan({ repoRef, issue, layout, orgLabels })
    const updated = edit.isApplied(issue) ? issue : yield* edit.write(issue)
    if (!edit.isApplied(updated)) return yield* new ForgejoForbidden()

    const card = toBoardCard(layout, org, repo, updated)
    const stored = yield* (yield* CardRanks).forOrg(org)
    return { card: { ...card, rank: rankOf(stored, card) } } satisfies CardUpdateResult
  })

/**
 * Adds or removes one assignee and keeps the others. Forgejo has no endpoint that adds one
 * assignee, so this reads the assignees and writes the whole list. A change made by someone
 * else in between is lost. Forgejo ignores the list without an error when the user cannot
 * write the repository's issues.
 */
export const setAssignee = (token: AccessToken, _login: string, request: SetAssigneeRequest) =>
  Effect.flatMap(parseLogin(request.login), (login) =>
    editCard(token, request, ({ repoRef }) => {
      const logins = (issue: ForgejoRepoIssue) =>
        (issue.assignees ?? []).map((assignee) => assignee.login)
      return Effect.succeed({
        isApplied: (issue) =>
          logins(issue).some((other) => sameLogin(other, login)) === request.assigned,
        write: (issue) =>
          ForgejoClient.use((forgejo) =>
            forgejo.setIssueAssignees(
              token,
              repoRef,
              request.number,
              request.assigned
                ? [...logins(issue), login]
                : logins(issue).filter((other) => !sameLogin(other, login)),
            ),
          ),
      } satisfies CardEdit)
    }),
  )

/**
 * Adds or removes one label and leaves the others alone. A status column label is refused:
 * the card's column changes only through a move. A label id Forgejo does not know is left to
 * Forgejo, which ignores it without an error.
 */
export const setLabel = (token: AccessToken, _login: string, request: SetLabelRequest) =>
  editCard(token, request, ({ repoRef, issue, layout, orgLabels }) =>
    Effect.gen(function* () {
      const forgejo = yield* ForgejoClient
      const byId = (label: ForgejoLabel) => label.id === request.labelId
      const label =
        orgLabels.find(byId) ??
        issue.labels.find(byId) ??
        (yield* forgejo.repoLabels(token, repoRef)).find(byId)
      if (label !== undefined && layout.isColumnLabel(label)) {
        return yield* new BoardRequestInvalid({
          message: `${label.name} is a board column; move the card to change its column`,
        })
      }
      return {
        isApplied: (current) => current.labels.some(byId) === request.present,
        write: (current) => {
          if (request.present) {
            return forgejo
              .addIssueLabels(token, repoRef, request.number, [request.labelId])
              .pipe(Effect.map((labels) => ({ ...current, labels })))
          }
          const present = current.labels.find(byId)
          if (present === undefined) return Effect.succeed(current)
          return forgejo
            .removeIssueLabel(token, repoRef, request.number, labelIdentifier(orgLabels, present))
            .pipe(Effect.andThen(forgejo.issue(token, repoRef, request.number)))
        },
      } satisfies CardEdit
    }),
  )

/** Sets or clears the milestone. Forgejo 17 refuses this with 403 when the user cannot write issues. */
export const setMilestone = (token: AccessToken, _login: string, request: SetMilestoneRequest) =>
  editCard(token, request, ({ repoRef }) =>
    Effect.succeed({
      isApplied: (issue) => (issue.milestone?.id ?? null) === request.milestoneId,
      write: () =>
        ForgejoClient.use((forgejo) =>
          forgejo.setIssueMilestone(token, repoRef, request.number, request.milestoneId),
        ),
    } satisfies CardEdit),
  )

/** Markdown rendered by Forgejo as it shows an issue; empty text renders as "" without a request. */
const renderIssueMarkdown = (token: AccessToken, repo: RepoRef, text: string) =>
  text === ""
    ? Effect.succeed("")
    : ForgejoClient.use((forgejo) => forgejo.renderMarkdown(token, repo, text))

const toCardComment = (comment: ForgejoComment, bodyHtml: string): CardComment => ({
  id: comment.id,
  author: { login: comment.user.login, avatarUrl: comment.user.avatar_url },
  createdAt: comment.created_at,
  bodyHtml,
})

const plainHtml = (text: string) =>
  `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>\n")}</p>`

/** Comments as the user who owns `token`; Forgejo decides who may comment. */
export const addComment = (token: AccessToken, _login: string, request: AddCommentRequest) =>
  Effect.gen(function* () {
    const repoRef = yield* parseRepoQuery(request.org, request.repo)
    yield* editableIssue(token, repoRef, request.number)
    const forgejo = yield* ForgejoClient
    const comment = yield* forgejo.createComment(token, repoRef, request.number, request.body)
    const bodyHtml = yield* renderIssueMarkdown(token, repoRef, comment.body).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          console.warn(`Rendering comment ${comment.id} failed`, error)
          return plainHtml(comment.body)
        }),
      ),
    )
    return { comment: toCardComment(comment, bodyHtml) } satisfies AddCommentResult
  })

// Each comment costs a render request; with the issue and its comments a detail stays at 23
// Forgejo requests, under the Workers Free plan's 50 subrequests per request.
const MAX_DETAIL_COMMENTS = 20
// Workers allow six open connections; renders leave two free.
const RENDER_CONCURRENCY = 4

/**
 * The issue's description and latest comments rendered by Forgejo, as the user who owns
 * `token` can read them. The HTML comes from Forgejo's sanitizing renderer; Tabulo passes it on
 * without reading it. Forgejo does not page an issue's comments, so this reads them all.
 */
export const cardDetail = (
  token: AccessToken,
  query: { readonly repo: RepoRef; readonly number: number },
) =>
  Effect.gen(function* () {
    const forgejo = yield* ForgejoClient
    const [body, comments] = yield* Effect.all(
      [
        forgejo.issueBody(token, query.repo, query.number),
        forgejo.issueComments(token, query.repo, query.number),
      ],
      { concurrency: "unbounded" },
    )
    const latest = comments.slice(-MAX_DETAIL_COMMENTS)
    const [bodyHtml, cardComments] = yield* Effect.all(
      [
        renderIssueMarkdown(token, query.repo, body),
        Effect.forEach(
          latest,
          (comment) =>
            renderIssueMarkdown(token, query.repo, comment.body).pipe(
              Effect.map((html) => toCardComment(comment, html)),
            ),
          { concurrency: RENDER_CONCURRENCY - 1 },
        ),
      ],
      { concurrency: "unbounded" },
    )
    return {
      key: cardKey(query.repo.owner, query.repo.name, query.number),
      bodyHtml,
      comments: cardComments,
      commentCount: comments.length,
    } satisfies CardDetail
  })

/**
 * What a card's labels, milestone, and assignees can be set to in the repository: its labels
 * and the organization's except status column labels and archived labels, its open
 * milestones, and the users Forgejo lets be assigned.
 */
export const issueOptions = (token: AccessToken, repo: RepoRef) =>
  Effect.gen(function* () {
    const settings = yield* BoardConfig
    const forgejo = yield* ForgejoClient
    const [orgLabels, repoLabels, milestones, assignees] = yield* Effect.all(
      [
        readOrgLabels(token, repo.owner),
        forgejo.repoLabels(token, repo),
        forgejo.openMilestones(token, repo),
        forgejo.repoAssignees(token, repo),
      ],
      { concurrency: "unbounded" },
    )
    const layout = boardLayout(settings.statusScope, orgLabels, UNORDERED)
    return {
      labels: [...orgLabels, ...repoLabels]
        .filter((label) => label.is_archived !== true && !layout.isColumnLabel(label))
        .map(toBoardLabel)
        .toSorted((a, b) => byName(a.name, b.name)),
      milestones: milestones.map(({ id, title }) => ({ id, title })),
      assignees: assignees.map(({ login, avatar_url }) => ({ login, avatarUrl: avatar_url })),
    } satisfies IssueOptions
  })
