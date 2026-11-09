import { Cause, Clock, Effect, Exit, Schema } from "effect"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import {
  AddCommentRequest,
  CreateBoardRequest,
  CreateCardRequest,
  type Dashboard,
  DeleteBoardRequest,
  type Instance,
  MAX_BOARDS,
  MoveCardRequest,
  SetAssigneeRequest,
  SetLabelRequest,
  SetMilestoneRequest,
  UpdateBoardRequest,
} from "../shared/api.ts"
import { beginLogin, completeLogin } from "./auth/oauth.ts"
import { currentSession, withAccessToken } from "./auth/session.ts"
import {
  addComment,
  BoardConfig,
  cardDetail,
  createCard,
  issueOptions,
  listOrgRepos,
  listOrgs,
  loadBoard,
  moveCard,
  parseCardQuery,
  parseName,
  parseRepoQuery,
  parseReposQuery,
  setAssignee,
  setLabel,
  setMilestone,
} from "./board.ts"
import { BoardStore, makeBoardStore } from "./board-store.ts"
import { createBoard, deleteBoard, listBoards, updateBoard } from "./boards.ts"
import { CardRanks, makeCardRanks } from "./card-ranks.ts"
import { loadConfig } from "./config.ts"
import { loadDashboardSections } from "./dashboard.ts"
import { EpicsConfig, loadEpics } from "./epics.ts"
import {
  type BoardChanged,
  type BoardLimitReached,
  type BoardNotFound,
  BoardRequestInvalid,
  type BoardWriteForbidden,
  type ConfigInvalid,
  describeForgejoError,
  type ForgejoError,
  type ForgejoMovePartlyApplied,
  type OAuthCallbackInvalid,
  type OAuthGrantRejected,
  type OAuthStateInvalid,
  type PageBudgetExhausted,
  type SessionNotFound,
} from "./errors.ts"
import {
  type AccessToken,
  ForgejoClient,
  type HttpFetch,
  makeForgejoClient,
  PAGE_BUDGET,
  type PageBudget,
} from "./forgejo/client.ts"
import { loadActivity, loadInsights, parseInsightsQuery, parseTimeZone } from "./load-insights.ts"
import { parseSearchQuery, searchItems } from "./search.ts"
import {
  makeSessionStore,
  OAUTH_STATE_LIFETIME_MS,
  SESSION_LIFETIME_MS,
  SessionStore,
} from "./session-store.ts"
import { sha256Hex } from "./token-crypto.ts"

export type Dependencies = {
  /** Outbound HTTP to Forgejo. Tests pass a fake Forgejo here. */
  readonly fetch: HttpFetch
  /** Tests pass a clock they control. */
  readonly clock?: Clock.Clock | undefined
}

type AppError =
  | BoardChanged
  | BoardLimitReached
  | BoardNotFound
  | BoardRequestInvalid
  | ConfigInvalid
  | ForgejoError
  | ForgejoMovePartlyApplied
  | OAuthCallbackInvalid
  | OAuthGrantRejected
  | OAuthStateInvalid
  | BoardWriteForbidden
  | PageBudgetExhausted
  | SessionNotFound

type AppContext = Context<{ Bindings: Env }>

// The __Host- prefix makes browsers reject the cookie unless it is Secure, has Path=/,
// and has no Domain, so a sibling subdomain cannot overwrite it.
const SESSION_COOKIE = "__Host-tabulo_session"
const OAUTH_STATE_COOKIE = "__Host-tabulo_oauth_state"

const cookieOptions = (maxAgeMs: number) =>
  ({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  }) as const

const sendsNonJsonBody = (contentType: string | undefined) =>
  contentType !== undefined && !/^application\/json\s*(;|$)/i.test(contentType)

const MAX_BODY_BYTES = 1024 * 1024

const unauthenticated = (c: AppContext) => {
  if (getCookie(c, SESSION_COOKIE) !== undefined) {
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true })
  }
  return c.json({ error: "unauthenticated" }, 401)
}

const errorResponse = (c: AppContext, error: AppError): Response => {
  switch (error._tag) {
    case "SessionNotFound":
    case "ForgejoUnauthorized":
      return unauthenticated(c)
    case "OAuthStateInvalid":
      return c.text("This sign-in link has expired or was already used. Sign in again.", 400)
    case "OAuthCallbackInvalid":
      return c.text(`Invalid sign-in callback: ${error.message}`, 400)
    case "OAuthGrantRejected":
      return c.text("Forgejo rejected the sign-in. Sign in again.", 400)
    case "ForgejoForbidden":
      return c.json({ error: describeForgejoError(error) }, 403)
    case "ForgejoNotFound":
      return c.json({ error: describeForgejoError(error) }, 404)
    case "BoardWriteForbidden":
      return c.json({ error: error.message }, 403)
    case "BoardRequestInvalid":
      return c.json({ error: error.message }, 400)
    case "BoardChanged":
      return c.json({ error: "The board changed since it was loaded", code: "board_changed" }, 409)
    case "BoardNotFound":
      return c.json({ error: "There is no such board", code: "board_not_found" }, 404)
    case "BoardLimitReached":
      return c.json({ error: `An organization can have at most ${MAX_BOARDS} boards` }, 400)
    case "ForgejoRequestFailed":
    case "ForgejoUnreachable":
    case "ForgejoDecodeFailed":
      return c.json({ error: describeForgejoError(error) }, 502)
    case "ForgejoMovePartlyApplied":
      return c.json(
        {
          error: `Forgejo applied part of the move, then failed (${error.reason})`,
          code: "move_partly_applied",
        },
        502,
      )
    case "PageBudgetExhausted":
      return c.json(
        { error: "Too many Forgejo pages for one request; choose fewer repositories" },
        503,
      )
    case "ConfigInvalid":
      console.error(`Tabulo is misconfigured: ${error.message}`)
      return c.json({ error: "Tabulo is misconfigured" }, 500)
  }
}

/** The request's JSON body, decoded with `schema`. */
const requestBody = <A>(c: AppContext, schema: Schema.Decoder<A>) =>
  Effect.tryPromise({
    try: () => c.req.json<unknown>(),
    catch: () => new BoardRequestInvalid({ message: "The body is not JSON" }),
  }).pipe(
    Effect.flatMap((body) =>
      Schema.decodeUnknownEffect(schema)(body).pipe(
        Effect.mapError((error) => new BoardRequestInvalid({ message: error.message })),
      ),
    ),
  )

export const createApp = (dependencies: Dependencies) => {
  const run = async (
    c: AppContext,
    program: Effect.Effect<
      Response,
      AppError,
      BoardConfig | BoardStore | CardRanks | EpicsConfig | ForgejoClient | SessionStore
    >,
  ): Promise<Response> => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const config = yield* loadConfig(c.env)
        return yield* program.pipe(
          Effect.provideService(
            ForgejoClient,
            makeForgejoClient(config.forgejo, dependencies.fetch),
          ),
          Effect.provideService(SessionStore, makeSessionStore(c.env.DB, config.tokenKey)),
          Effect.provideService(BoardConfig, config.board),
          Effect.provideService(EpicsConfig, { label: config.epicLabel }),
          Effect.provideService(CardRanks, makeCardRanks(c.env.DB)),
          Effect.provideService(BoardStore, makeBoardStore(c.env.DB)),
        )
      }).pipe(Effect.provideService(Clock.Clock, dependencies.clock ?? Clock.Clock.defaultValue())),
    )
    if (Exit.isSuccess(exit)) return exit.value
    const failure = exit.cause.reasons.find(Cause.isFailReason)
    if (failure !== undefined) return errorResponse(c, failure.error)
    console.error(Cause.pretty(exit.cause))
    return c.json({ error: "Internal error" }, 500)
  }

  const app = new Hono<{ Bindings: Env }>()

  app.use(async (c, next) => {
    await next()
    c.header("Cache-Control", "no-store")
    c.header("X-Content-Type-Options", "nosniff")
    c.header("Strict-Transport-Security", "max-age=31536000")
  })

  app.use(async (c, next) => {
    if (c.req.method === "GET" || c.req.method === "HEAD") return next()
    const appOrigin = URL.canParse(c.env.APP_URL) ? new URL(c.env.APP_URL).origin : undefined
    if (appOrigin === undefined || c.req.header("origin") !== appOrigin) {
      return c.json({ error: "Cross-origin request refused" }, 403)
    }
    if (sendsNonJsonBody(c.req.header("content-type"))) {
      return c.json({ error: "Send the request body as application/json" }, 415)
    }
    return next()
  })

  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "The request body is too large" }, 413),
    }),
  )

  app.get("/auth/login", (c) =>
    run(
      c,
      Effect.map(beginLogin, ({ state, authorizeUrl }) => {
        setCookie(c, OAUTH_STATE_COOKIE, state, cookieOptions(OAUTH_STATE_LIFETIME_MS))
        return c.redirect(authorizeUrl, 302)
      }),
    ),
  )

  app.get("/auth/callback", async (c) => {
    // The user declined on Forgejo's consent page: back to the sign-in screen.
    if (c.req.query("error") !== undefined) return c.redirect("/", 302)
    const browserState = getCookie(c, OAUTH_STATE_COOKIE)
    deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/", secure: true })
    return run(
      c,
      Effect.map(
        completeLogin({
          code: c.req.query("code"),
          state: c.req.query("state"),
          browserState,
          previousSession: getCookie(c, SESSION_COOKIE),
        }),
        (cookieValue) => {
          setCookie(c, SESSION_COOKIE, cookieValue, cookieOptions(SESSION_LIFETIME_MS))
          return c.redirect("/", 302)
        },
      ),
    )
  })

  app.post("/auth/logout", (c) => {
    const cookieValue = getCookie(c, SESSION_COOKIE)
    const removal =
      cookieValue === undefined
        ? Effect.void
        : sha256Hex(cookieValue).pipe(
            Effect.flatMap((idHash) => SessionStore.use((store) => store.remove(idHash))),
          )
    return run(
      c,
      Effect.map(removal, () => {
        deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true })
        return c.body(null, 204)
      }),
    )
  })

  app.get("/api/me", (c) =>
    run(
      c,
      Effect.map(currentSession(getCookie(c, SESSION_COOKIE)), (session) => c.json(session.user)),
    ),
  )

  app.get("/api/dashboard", (c) =>
    run(
      c,
      withAccessToken(getCookie(c, SESSION_COOKIE), (token, session) =>
        loadDashboardSections(token).pipe(
          Effect.map((sections) => c.json({ user: session.user, ...sections } satisfies Dashboard)),
        ),
      ),
    ),
  )

  app.get("/api/search", (c) =>
    run(
      c,
      Effect.flatMap(parseSearchQuery(c.req.query("q"), c.req.query("limit")), (query) =>
        withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
          searchItems(token, query).pipe(Effect.map((results) => c.json(results))),
        ),
      ),
    ),
  )

  app.get("/api/instance", (c) =>
    run(
      c,
      currentSession(getCookie(c, SESSION_COOKIE)).pipe(
        Effect.flatMap(() => ForgejoClient),
        Effect.map((forgejo) => c.json({ forgejoUrl: forgejo.baseUrl } satisfies Instance)),
      ),
    ),
  )

  app.get("/api/orgs", (c) =>
    run(
      c,
      withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
        listOrgs(token).pipe(Effect.map((orgs) => c.json(orgs))),
      ),
    ),
  )

  app.get("/api/orgs/:org/repos", (c) =>
    run(
      c,
      Effect.flatMap(parseName("org", c.req.param("org")), (org) =>
        withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
          listOrgRepos(token, org).pipe(Effect.map((repos) => c.json(repos))),
        ),
      ),
    ),
  )

  app.get("/api/boards", (c) =>
    run(
      c,
      Effect.flatMap(parseName("org", c.req.query("org")), (org) =>
        withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
          listBoards(token, org).pipe(Effect.map((boards) => c.json(boards))),
        ),
      ),
    ),
  )

  app.get("/api/board", (c) =>
    run(
      c,
      Effect.flatMap(parseReposQuery(c.req.query("org"), c.req.query("repos")), (query) =>
        withAccessToken(getCookie(c, SESSION_COOKIE), (token, session) =>
          loadBoard(token, session.user.login, query).pipe(Effect.map((board) => c.json(board))),
        ),
      ),
    ),
  )

  app.get("/api/epics", (c) =>
    run(
      c,
      Effect.flatMap(parseReposQuery(c.req.query("org"), c.req.query("repos")), (query) => {
        const pool: PageBudget = { remaining: PAGE_BUDGET }
        return withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
          loadEpics(token, query, pool).pipe(Effect.map((epics) => c.json(epics))),
        )
      }),
    ),
  )

  app.get("/api/board/issue", (c) =>
    run(
      c,
      Effect.flatMap(
        parseCardQuery(c.req.query("org"), c.req.query("repo"), c.req.query("number")),
        (query) =>
          withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
            cardDetail(token, query).pipe(Effect.map((detail) => c.json(detail))),
          ),
      ),
    ),
  )

  app.get("/api/board/issue-options", (c) =>
    run(
      c,
      Effect.flatMap(parseRepoQuery(c.req.query("org"), c.req.query("repo")), (repo) =>
        withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
          issueOptions(token, repo).pipe(Effect.map((options) => c.json(options))),
        ),
      ),
    ),
  )

  app.get("/api/insights", (c) =>
    run(
      c,
      Effect.flatMap(
        parseInsightsQuery({
          org: c.req.query("org"),
          repos: c.req.query("repos"),
          days: c.req.query("days"),
          tz: c.req.query("tz"),
          user: c.req.query("user"),
        }),
        (query) => {
          const pool: PageBudget = { remaining: PAGE_BUDGET }
          return withAccessToken(getCookie(c, SESSION_COOKIE), (token) =>
            loadInsights(token, query, pool).pipe(Effect.map((insights) => c.json(insights))),
          )
        },
      ),
    ),
  )

  app.get("/api/activity", (c) =>
    run(
      c,
      Effect.flatMap(parseTimeZone(c.req.query("tz")), (tz) =>
        withAccessToken(getCookie(c, SESSION_COOKIE), (token, session) =>
          loadActivity(token, session.user.login, tz).pipe(
            Effect.map((activity) => c.json(activity)),
          ),
        ),
      ),
    ),
  )
  const boardWrite =
    <A, R>(
      schema: Schema.Decoder<A>,
      write: (
        token: AccessToken,
        login: string,
        request: A,
      ) => Effect.Effect<R, AppError, BoardConfig | BoardStore | CardRanks | ForgejoClient>,
    ) =>
    (c: AppContext) =>
      run(
        c,
        Effect.flatMap(requestBody(c, schema), (request) =>
          withAccessToken(getCookie(c, SESSION_COOKIE), (token, session) =>
            write(token, session.user.login, request).pipe(Effect.map((result) => c.json(result))),
          ),
        ),
      )

  app.post("/api/boards", boardWrite(CreateBoardRequest, createBoard))
  app.post("/api/boards/update", boardWrite(UpdateBoardRequest, updateBoard))
  app.post("/api/boards/delete", boardWrite(DeleteBoardRequest, deleteBoard))
  app.post("/api/board/move", boardWrite(MoveCardRequest, moveCard))
  app.post("/api/board/issues", boardWrite(CreateCardRequest, createCard))
  app.post("/api/board/assignees", boardWrite(SetAssigneeRequest, setAssignee))
  app.post("/api/board/labels", boardWrite(SetLabelRequest, setLabel))
  app.post("/api/board/milestone", boardWrite(SetMilestoneRequest, setMilestone))
  app.post("/api/board/comment", boardWrite(AddCommentRequest, addComment))

  return app
}
