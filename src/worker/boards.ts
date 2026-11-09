import { Effect } from "effect"
import {
  type BoardList,
  type CreateBoardRequest,
  DEFAULT_BOARD_NAME,
  type DeleteBoardRequest,
  MAX_REPOS,
  type SavedBoardResult,
  type UpdateBoardRequest,
} from "../shared/api.ts"
import { BoardConfig, defaultPlan, parseName, requireMember } from "./board.ts"
import {
  type BoardRecord,
  BoardStore,
  DEFAULT_BOARD,
  parseBoardId,
  toSavedBoard,
  unchangedDefault,
} from "./board-store.ts"
import { BoardChanged, BoardNotFound, BoardRequestInvalid } from "./errors.ts"
import { type AccessToken, ForgejoClient } from "./forgejo/client.ts"
import type { ForgejoRepo } from "./forgejo/schemas.ts"

const byName = new Intl.Collator("en").compare

/** Lowercased repository names of a board request; a name twice in any case answers 400. */
const parseRepoNames = (names: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.forEach(names, (name) => parseName("repository", name))
    if (new Set(parsed).size !== parsed.length) {
      return yield* new BoardRequestInvalid({ message: "repos names a repository twice" })
    }
    return parsed
  })

/**
 * The requested repositories as Forgejo spells them. A name the user cannot read answers 400,
 * so a board never stores a name its author could not see.
 */
const readableNames = (
  org: string,
  requested: ReadonlyArray<string>,
  visible: ReadonlyArray<ForgejoRepo>,
) => {
  const byLowerName = new Map(visible.map((repo) => [repo.name.toLowerCase(), repo.name]))
  const names = requested.flatMap((name) => byLowerName.get(name) ?? [])
  return names.length === requested.length
    ? Effect.succeed(names)
    : Effect.fail(
        new BoardRequestInvalid({ message: `Choose repositories of ${org} that you can read` }),
      )
}

/** The stored repositories of `board` the user cannot read, in their stored order. */
const unreadableRepos = (board: BoardRecord, visible: ReadonlyArray<ForgejoRepo>) => {
  const readable = new Set(visible.map((repo) => repo.name.toLowerCase()))
  return board.repos.filter((name) => !readable.has(name))
}

/**
 * The organization's boards, the default board first, then the others by name. Only users who
 * can see the organization in Forgejo may list them.
 */
export const listBoards = (token: AccessToken, org: string) =>
  Effect.gen(function* () {
    const [, stored] = yield* Effect.all(
      [
        ForgejoClient.use((forgejo) => forgejo.org(token, org)),
        BoardStore.use((boards) => boards.list(org)),
      ],
      { concurrency: "unbounded" },
    )
    const storedDefault = stored.find((board) => board.id === DEFAULT_BOARD)
    const others = stored
      .filter((board) => board.id !== DEFAULT_BOARD)
      .sort((a, b) => byName(a.name, b.name) || (a.id < b.id ? -1 : 1))
    return {
      boards: [
        { id: DEFAULT_BOARD, name: storedDefault?.name ?? DEFAULT_BOARD_NAME },
        ...others.map(({ id, name }) => ({ id, name })),
      ],
    } satisfies BoardList
  })

/** Adds a board with the default board's column order and hidden columns. */
export const createBoard = (token: AccessToken, login: string, request: CreateBoardRequest) =>
  Effect.gen(function* () {
    const org = yield* parseName("org", request.org)
    const repos = yield* parseRepoNames(request.repos)
    yield* requireMember(token, org, `Only members of ${org} can add boards`)
    const [visible, plan] = yield* Effect.all(
      [ForgejoClient.use((forgejo) => forgejo.orgRepos(token, org)), defaultPlan(org)],
      { concurrency: "unbounded" },
    )
    const names = yield* readableNames(org, repos, visible)
    const board = yield* BoardStore.use((boards) =>
      boards.insert(
        org,
        { name: request.name, repos, columns: plan.columns, hidden: plan.hidden },
        login,
      ),
    )
    return { board: toSavedBoard(board, names, 0) } satisfies SavedBoardResult
  })

/**
 * Replaces a board's name, repositories, and columns if it is still at `request.version`. The
 * stored repositories the user cannot read stay unless the request drops them. Every Forgejo
 * read comes before the one D1 write, so a rerun after a token refresh cannot write twice.
 */
export const updateBoard = (token: AccessToken, login: string, request: UpdateBoardRequest) =>
  Effect.gen(function* () {
    const org = yield* parseName("org", request.org)
    const repos = yield* parseRepoNames(request.repos)
    const id = parseBoardId(request.board)
    yield* requireMember(token, org, `Only members of ${org} can change its boards`)
    const [stored, visible] = yield* Effect.all(
      [
        id === null ? Effect.succeed(undefined) : BoardStore.use((boards) => boards.find(org, id)),
        ForgejoClient.use((forgejo) => forgejo.orgRepos(token, org)),
      ],
      { concurrency: "unbounded" },
    )
    const current =
      stored ??
      (id === DEFAULT_BOARD
        ? unchangedDefault((yield* BoardConfig).defaultColumns, visible)
        : yield* new BoardNotFound())
    if (current.version !== request.version) return yield* new BoardChanged()
    const names = yield* readableNames(org, repos, visible)
    const kept = request.dropUnreadable ? [] : unreadableRepos(current, visible)
    if (repos.length + kept.length > MAX_REPOS) {
      return yield* new BoardRequestInvalid({
        message: `This board keeps ${kept.length} repositories you cannot read, so choose at most ${MAX_REPOS - kept.length}, or remove those`,
      })
    }
    const board = yield* BoardStore.use((boards) =>
      boards.replace(
        org,
        current,
        {
          name: request.name,
          repos: [...repos, ...kept],
          columns: request.columns,
          hidden: request.hidden,
        },
        login,
      ),
    )
    return { board: toSavedBoard(board, names, kept.length) } satisfies SavedBoardResult
  })

/** Deletes a board if it is still at `request.version`. Its cards keep their order. */
export const deleteBoard = (token: AccessToken, _login: string, request: DeleteBoardRequest) =>
  Effect.gen(function* () {
    const org = yield* parseName("org", request.org)
    const id = parseBoardId(request.board)
    if (id === DEFAULT_BOARD) {
      return yield* new BoardRequestInvalid({ message: "The default board cannot be deleted" })
    }
    yield* requireMember(token, org, `Only members of ${org} can delete its boards`)
    if (id === null) return yield* new BoardNotFound()
    yield* BoardStore.use((boards) => boards.remove(org, { id, version: request.version }))
    return {}
  })
