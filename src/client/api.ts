import { Schema } from "effect"
import {
  type AddCommentRequest,
  AddCommentResult,
  Board,
  CardDetail,
  CardUpdateResult,
  type CreateCardRequest,
  CreateCardResult,
  Dashboard,
  IssueOptions,
  type MoveCardRequest,
  MoveCardResult,
  Org,
  OrgRepo,
  type SetAssigneeRequest,
  type SetLabelRequest,
  type SetMilestoneRequest,
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

const decodeUser = Schema.decodeUnknownPromise(User)
const decodeDashboard = Schema.decodeUnknownPromise(Dashboard)
const decodeOrgs = Schema.decodeUnknownPromise(Schema.Array(Org))
const decodeOrgRepos = Schema.decodeUnknownPromise(Schema.Array(OrgRepo))
const decodeBoard = Schema.decodeUnknownPromise(Board)
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
      typeof body.error === "string" ? body.error : `Tabulo returned HTTP ${response.status}`,
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

export const fetchBoard = async (org: string, repos: ReadonlyArray<string>): Promise<Board> =>
  decodeBoard(
    await requestJson(`/api/board?${new URLSearchParams({ org, repos: repos.join(",") })}`),
  )

const postJson = (path: string, body: unknown) =>
  requestJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

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
