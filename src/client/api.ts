import { Schema } from "effect"
import {
  Activity,
  type AddCommentRequest,
  AddCommentResult,
  Board,
  BoardList,
  CardDetail,
  CardUpdateResult,
  type CreateBoardRequest,
  type CreateCardRequest,
  CreateCardResult,
  Dashboard,
  DEFAULT_BOARD_ID,
  type DeleteBoardRequest,
  Epics,
  type InsightDays,
  Insights,
  Instance,
  IssueOptions,
  type MoveCardRequest,
  MoveCardResult,
  Org,
  OrgRepo,
  type SavedBoard,
  SavedBoardResult,
  SearchResults,
  type SetAssigneeRequest,
  type SetLabelRequest,
  type SetMilestoneRequest,
  type UpdateBoardRequest,
  User,
} from "../shared/api.ts"

/** The server answered 401: there is no usable session. */
export class Unauthenticated extends Error {
  constructor() {
    super("Not signed in")
  }
}

export class RequestFailed extends Error {
  readonly status: number
  /** Set when the server names the failure, such as `board_changed`. */
  readonly code: string | undefined

  constructor(message: string, status: number, code: string | undefined) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Whether a read answered 404: a board, or its organization, that the user cannot have. */
export const isNotFound = (error: unknown) => error instanceof RequestFailed && error.status === 404

const decodeUser = Schema.decodeUnknownPromise(User)
const decodeDashboard = Schema.decodeUnknownPromise(Dashboard)
const decodeOrgs = Schema.decodeUnknownPromise(Schema.Array(Org))
const decodeOrgRepos = Schema.decodeUnknownPromise(Schema.Array(OrgRepo))
const decodeBoard = Schema.decodeUnknownPromise(Board)
const decodeBoardList = Schema.decodeUnknownPromise(BoardList)
const decodeSavedBoardResult = Schema.decodeUnknownPromise(SavedBoardResult)
const decodeEpics = Schema.decodeUnknownPromise(Epics)
const decodeMoveCardResult = Schema.decodeUnknownPromise(MoveCardResult)
const decodeCreateCardResult = Schema.decodeUnknownPromise(CreateCardResult)
const decodeCardUpdateResult = Schema.decodeUnknownPromise(CardUpdateResult)
const decodeAddCommentResult = Schema.decodeUnknownPromise(AddCommentResult)
const decodeIssueOptions = Schema.decodeUnknownPromise(IssueOptions)
const decodeCardDetail = Schema.decodeUnknownPromise(CardDetail)

const requestJson = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(path, {
    ...init,
    headers: { accept: "application/json", ...init?.headers },
  })
  if (response.status === 401) throw new Unauthenticated()
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown }
    throw new RequestFailed(
      typeof body.error === "string"
        ? body.error
        : response.status >= 500
          ? "Tabulo did not get an answer; try again in a moment"
          : `Something went wrong (HTTP ${response.status})`,
      response.status,
      typeof body.code === "string" ? body.code : undefined,
    )
  }
  return response.json()
}

/** The signed-in user, or `null` when the browser has no session. */
export const fetchSessionUser = async (): Promise<User | null> => {
  try {
    return await decodeUser(await requestJson("/api/me"))
  } catch (error) {
    if (error instanceof Unauthenticated) return null
    throw error
  }
}

export const fetchDashboard = async (): Promise<Dashboard> =>
  decodeDashboard(await requestJson("/api/dashboard"))

export const fetchOrgs = async (): Promise<ReadonlyArray<Org>> =>
  decodeOrgs(await requestJson("/api/orgs"))

export const fetchOrgRepos = async (org: string): Promise<ReadonlyArray<OrgRepo>> =>
  decodeOrgRepos(await requestJson(`/api/orgs/${encodeURIComponent(org)}/repos`))

export const fetchBoard = async (org: string, board = DEFAULT_BOARD_ID): Promise<Board> =>
  decodeBoard(await requestJson(`/api/board?${new URLSearchParams({ org, board })}`))

export const fetchBoards = async (org: string): Promise<BoardList> =>
  decodeBoardList(await requestJson(`/api/boards?${new URLSearchParams({ org })}`))

const postJson = (path: string, body: unknown) =>
  requestJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

export const createBoard = async (request: CreateBoardRequest): Promise<SavedBoard> =>
  (await decodeSavedBoardResult(await postJson("/api/boards", request))).board

/** Fails with `board_changed` when the board is no longer at `request.version`. */
export const updateBoard = async (request: UpdateBoardRequest): Promise<SavedBoard> =>
  (await decodeSavedBoardResult(await postJson("/api/boards/update", request))).board

export const deleteBoard = async (request: DeleteBoardRequest): Promise<void> => {
  await postJson("/api/boards/delete", request)
}

export const moveCard = async (move: MoveCardRequest): Promise<MoveCardResult> =>
  decodeMoveCardResult(await postJson("/api/board/move", move))

export const createCard = async (request: CreateCardRequest): Promise<CreateCardResult> =>
  decodeCreateCardResult(await postJson("/api/board/issues", request))

export const setAssignee = async (request: SetAssigneeRequest): Promise<CardUpdateResult> =>
  decodeCardUpdateResult(await postJson("/api/board/assignees", request))

export const setLabel = async (request: SetLabelRequest): Promise<CardUpdateResult> =>
  decodeCardUpdateResult(await postJson("/api/board/labels", request))

export const setMilestone = async (request: SetMilestoneRequest): Promise<CardUpdateResult> =>
  decodeCardUpdateResult(await postJson("/api/board/milestone", request))

export const addComment = async (request: AddCommentRequest): Promise<AddCommentResult> =>
  decodeAddCommentResult(await postJson("/api/board/comment", request))

export const fetchIssueOptions = async (org: string, repo: string): Promise<IssueOptions> =>
  decodeIssueOptions(
    await requestJson(`/api/board/issue-options?${new URLSearchParams({ org, repo })}`),
  )

export const fetchCardDetail = async (
  org: string,
  repo: string,
  number: number,
): Promise<CardDetail> =>
  decodeCardDetail(
    await requestJson(
      `/api/board/issue?${new URLSearchParams({ org, repo, number: String(number) })}`,
    ),
  )

export const fetchEpics = async (org: string, repos: ReadonlyArray<string>): Promise<Epics> =>
  decodeEpics(
    await requestJson(`/api/epics?${new URLSearchParams({ org, repos: repos.join(",") })}`),
  )
const decodeSearchResults = Schema.decodeUnknownPromise(SearchResults)
const decodeInstance = Schema.decodeUnknownPromise(Instance)

export const fetchSearch = async (q: string, signal?: AbortSignal): Promise<SearchResults> =>
  decodeSearchResults(
    await requestJson(
      `/api/search?${new URLSearchParams({ q })}`,
      signal === undefined ? {} : { signal },
    ),
  )

export const fetchInstance = async (): Promise<Instance> =>
  decodeInstance(await requestJson("/api/instance"))

export const signOut = async (): Promise<void> => {
  const response = await fetch("/auth/logout", { method: "POST" })
  if (!response.ok) {
    throw new RequestFailed(
      `Sign-out failed with HTTP ${response.status}`,
      response.status,
      undefined,
    )
  }
}

// Insights and activity.

const decodeInsights = Schema.decodeUnknownPromise(Insights)
const decodeActivity = Schema.decodeUnknownPromise(Activity)

/** The browser's IANA time zone, which buckets weeks and hours on the server. */
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The insights of `repos`, narrowed to the person whose login is `user` unless it is null. */
export const fetchInsights = async (
  org: string,
  repos: ReadonlyArray<string>,
  days: InsightDays,
  tz: string,
  user: string | null,
): Promise<Insights> =>
  decodeInsights(
    await requestJson(
      `/api/insights?${new URLSearchParams({
        org,
        repos: repos.join(","),
        days: String(days),
        tz,
        ...(user === null ? {} : { user }),
      })}`,
    ),
  )

export const fetchActivity = async (tz: string): Promise<Activity> =>
  decodeActivity(await requestJson(`/api/activity?${new URLSearchParams({ tz })}`))
