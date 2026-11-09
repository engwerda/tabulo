import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo, type FakeOrg } from "./fake-forgejo.ts"
import { acme, backlog, boardIssue, boardRepo, grace, inProgress, outsider } from "./fixtures.ts"
import { postJson, signIn, tabulo } from "./harness.ts"

type SavedBoard = {
  id: string
  name: string
  repos: Array<string>
  unreadableRepos: number
  columns: Array<string>
  hidden: Array<string>
  version: number
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
    env.DB.prepare("DELETE FROM card_ranks"),
    env.DB.prepare("DELETE FROM boards"),
  ])
})

/** acme with `secret`, which grace cannot read, and `Web`, which Forgejo spells capitalized. */
const boardsOrg = (): FakeOrg =>
  acme([
    boardRepo("api", {
      issues: [boardIssue("api", 1), boardIssue("api", 2, { labels: [inProgress] })],
    }),
    boardRepo("Web", { issues: [boardIssue("Web", 3, { labels: [backlog] })] }),
    boardRepo("secret", {
      hiddenFrom: ["grace"],
      issues: [boardIssue("secret", 4, { title: "Acquisition plans" })],
    }),
  ])

const session = async (
  overrides: Parameters<typeof createFakeForgejo>[0] = {},
  vars: Partial<Env> = {},
) => {
  const forgejo = createFakeForgejo({
    orgs: [boardsOrg()],
    otherUsers: [grace, outsider],
    ...overrides,
  })
  const clock = createFakeClock()
  const call = tabulo(forgejo.fetch, { clock: clock.clock, vars })
  const ada = await signIn(call, forgejo)
  const graceCookie = await signIn(call, forgejo, "grace")
  const linus = await signIn(call, forgejo, "linus")
  const get = (path: string, cookie = ada) => call(path, { headers: { cookie } })
  const post = (path: string, body: unknown, cookie = ada) => postJson(call, cookie, path, body)
  const create = async (name: string, repos: ReadonlyArray<string> = ["api"], cookie = ada) => {
    const response = await post("/api/boards", { org: "acme", name, repos }, cookie)
    expect(response.status).toBe(200)
    return ((await response.json()) as { board: SavedBoard }).board
  }
  return { forgejo, clock, call, ada, grace: graceCookie, linus, get, post, create }
}

/** An update of `board` from `version` that changes only what `fields` names. */
const update = (board: string, version: number, fields: Record<string, unknown> = {}) => ({
  org: "acme",
  board,
  version,
  name: "Board",
  repos: ["api"],
  columns: [],
  hidden: [],
  dropUnreadable: false,
  ...fields,
})

const storedBoards = async () =>
  (
    await env.DB.prepare(
      "SELECT id, name, repos, column_order, hidden_columns, version, updated_by FROM boards ORDER BY id",
    ).all()
  ).results

const listed = async (response: Response) =>
  ((await response.json()) as { boards: Array<{ id: string; name: string }> }).boards

/** A D1 whose statements matching `sql` wait for `before` before they run. */
const holdStatements = (db: D1Database, sql: string, before: () => Promise<void>): D1Database => {
  const held = (bound: D1PreparedStatement) =>
    new Proxy(bound, {
      get: (target, property) => {
        const value: unknown = Reflect.get(target, property)
        if (typeof value !== "function") return value
        return property === "first" || property === "run" || property === "all"
          ? async (...args: Array<unknown>) => {
              await before()
              return value.apply(target, args)
            }
          : value.bind(target)
      },
    })
  return new Proxy(db, {
    get: (target, property) => {
      const value: unknown = Reflect.get(target, property)
      if (property !== "prepare") return typeof value === "function" ? value.bind(target) : value
      return (text: string) => {
        const statement = target.prepare(text)
        if (!text.includes(sql)) return statement
        return new Proxy(statement, {
          get: (st, prop) => {
            if (prop === "bind") return (...args: Array<unknown>) => held(st.bind(...args))
            const member: unknown = Reflect.get(st, prop)
            return typeof member === "function" ? member.bind(st) : member
          },
        })
      }
    },
  })
}

/** Resolves for everyone once `parties` callers are waiting, so they go on together. */
const barrier = (parties: number) => {
  let arrived = 0
  let release = () => {}
  const all = new Promise<void>((resolve) => {
    release = resolve
  })
  return () => {
    arrived += 1
    if (arrived === parties) release()
    return all
  }
}

describe("GET /api/boards", () => {
  it("lists only the default board, named Board, and stores nothing", async () => {
    const { get } = await session()

    const response = await get("/api/boards?org=acme")

    expect(response.status).toBe(200)
    expect(await listed(response)).toEqual([{ id: "default", name: "Board" }])
    expect(await storedBoards()).toEqual([])
  })

  it("lists the default board first, under its stored name, and the others by name", async () => {
    const { get, post, create } = await session()
    const zeta = await create("Zeta")
    const alpha = await create("alpha")
    const beta = await create("Beta")
    await post("/api/boards/update", update("default", 0, { name: "Roadmap" }))

    const boards = await listed(await get("/api/boards?org=ACME"))

    expect(boards).toEqual([
      { id: "default", name: "Roadmap" },
      { id: alpha.id, name: "alpha" },
      { id: beta.id, name: "Beta" },
      { id: zeta.id, name: "Zeta" },
    ])
  })

  it("lets someone outside the organization list its boards when Forgejo shows it to them", async () => {
    const { get, create, linus } = await session()
    const design = await create("Design")

    const response = await get("/api/boards?org=acme", linus)

    expect(response.status).toBe(200)
    expect(await listed(response)).toEqual([
      { id: "default", name: "Board" },
      { id: design.id, name: "Design" },
    ])
  })

  it("answers 404 without board_not_found when Forgejo does not show the organization", async () => {
    const { get, linus } = await session({ orgs: [{ ...boardsOrg(), hiddenFrom: ["linus"] }] })

    const response = await get("/api/boards?org=acme", linus)

    expect(response.status).toBe(404)
    expect(await response.json()).not.toHaveProperty("code")
  })

  it("answers 400 to an invalid organization name", async () => {
    const { get } = await session()

    expect((await get("/api/boards?org=acme%2Fapi")).status).toBe(400)
    expect((await get("/api/boards")).status).toBe(400)
  })
})

describe("POST /api/boards", () => {
  it("adds a board with a random id, version 1, and the default board's columns", async () => {
    const { get, post, create } = await session()
    await post(
      "/api/boards/update",
      update("default", 0, {
        columns: ["done", "Status/Review", "todo"],
        hidden: ["Status/Backlog"],
      }),
    )

    const board = await create("Design", ["web", "api"])

    expect(board).toEqual({
      id: expect.stringMatching(/^[a-z0-9]{8}$/),
      name: "Design",
      repos: ["Web", "api"],
      unreadableRepos: 0,
      columns: ["done", "Status/Review", "todo"],
      hidden: ["Status/Backlog"],
      version: 1,
    })
    expect(await listed(await get("/api/boards?org=acme"))).toContainEqual({
      id: board.id,
      name: "Design",
    })
  })

  it("starts a board with BOARD_COLUMNS while no member has changed the default board", async () => {
    const { create } = await session({}, { BOARD_COLUMNS: "Status/Review, Todo" })

    const board = await create("Design")

    expect(board).toMatchObject({ columns: ["Status/Review", "todo"], hidden: [] })
  })

  it("gives every board its own id", async () => {
    const { create } = await session()

    const ids = new Set(
      [await create("One"), await create("Two"), await create("Three")].map((b) => b.id),
    )

    expect(ids.size).toBe(3)
  })

  it.each([
    ["an untrimmed name", { name: " Design" }],
    ["an empty name", { name: "" }],
    ["a name of 61 characters", { name: "x".repeat(61) }],
    ["no repositories", { repos: [] }],
    ["21 repositories", { repos: Array.from({ length: 21 }, (_, i) => `r${i}`) }],
    ["an invalid repository name", { repos: [".."] }],
    ["a repository twice in other case", { repos: ["api", "API"] }],
    ["an invalid organization name", { org: "acme/api" }],
  ])("answers 400 to %s and stores nothing", async (_, fields) => {
    const { post } = await session()

    const response = await post("/api/boards", {
      org: "acme",
      name: "Design",
      repos: ["api"],
      ...fields,
    })

    expect(response.status).toBe(400)
    expect(await storedBoards()).toEqual([])
  })

  it.each([
    ["the user cannot read", "secret"],
    ["does not exist", "nope"],
  ])("answers 400 to a repository %s and stores nothing", async (_, repo) => {
    const { post, grace } = await session()

    const response = await post(
      "/api/boards",
      { org: "acme", name: "Design", repos: ["api", repo] },
      grace,
    )

    expect(response.status).toBe(400)
    expect(await storedBoards()).toEqual([])
  })

  it("answers 403 to someone outside the organization and stores nothing", async () => {
    const { post, linus } = await session()

    const response = await post(
      "/api/boards",
      { org: "acme", name: "Design", repos: ["api"] },
      linus,
    )

    expect(response.status).toBe(403)
    expect(await storedBoards()).toEqual([])
  })

  it("answers 400 to a 51st board, counting the default board whether stored or not", async () => {
    const { post, create } = await session()
    for (let i = 0; i < 49; i++) await create(`Board ${i}`)

    const unstoredDefault = await post("/api/boards", {
      org: "acme",
      name: "One more",
      repos: ["api"],
    })
    await post("/api/boards/update", update("default", 0))
    const storedDefault = await post("/api/boards", {
      org: "acme",
      name: "One more",
      repos: ["api"],
    })

    expect([unstoredDefault.status, storedDefault.status]).toEqual([400, 400])
    expect(await unstoredDefault.json()).toEqual({
      error: "An organization can have at most 50 boards",
    })
    expect(await storedBoards()).toHaveLength(50)
  })

  it("lets only one of two members add the 50th board at the same moment", async () => {
    const forgejo = createFakeForgejo({ orgs: [boardsOrg()], otherUsers: [grace] })
    const clock = createFakeClock().clock
    const plain = tabulo(forgejo.fetch, { clock })
    const ada = await signIn(plain, forgejo)
    const graceCookie = await signIn(plain, forgejo, "grace")
    for (let i = 0; i < 48; i++) {
      await postJson(plain, ada, "/api/boards", { org: "acme", name: `Board ${i}`, repos: ["api"] })
    }
    // Both requests pass every check before either inserts.
    const racing = tabulo(forgejo.fetch, {
      clock,
      vars: { DB: holdStatements(env.DB, "INSERT INTO boards", barrier(2)) },
    })

    const responses = await Promise.all([
      postJson(racing, ada, "/api/boards", { org: "acme", name: "Ada's", repos: ["api"] }),
      postJson(racing, graceCookie, "/api/boards", {
        org: "acme",
        name: "Grace's",
        repos: ["api"],
      }),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400])
    expect(await storedBoards()).toHaveLength(49)
  })
})

describe("POST /api/boards/update", () => {
  it("replaces the name, repositories, and columns and adds 1 to the version", async () => {
    const { get, post, create } = await session()
    const board = await create("Design", ["api"])

    const response = await post(
      "/api/boards/update",
      update(board.id.toUpperCase(), 1, {
        name: "Platform",
        repos: ["WEB", "api"],
        columns: ["Status/Review", "todo"],
        hidden: ["done"],
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      board: {
        id: board.id,
        name: "Platform",
        repos: ["Web", "api"],
        unreadableRepos: 0,
        columns: ["Status/Review", "todo"],
        hidden: ["done"],
        version: 2,
      },
    })
    expect(await listed(await get("/api/boards?org=acme"))).toContainEqual({
      id: board.id,
      name: "Platform",
    })
  })

  it("stores the default board on its first change, from version 0 to 1", async () => {
    const { post } = await session()

    const response = await post("/api/boards/update", update("DEFAULT", 0, { name: "Roadmap" }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      board: { id: "default", name: "Roadmap", repos: ["api"], version: 1 },
    })
    expect(await storedBoards()).toEqual([
      expect.objectContaining({ id: "default", name: "Roadmap", version: 1, updated_by: "ada" }),
    ])
  })

  it.each([
    ["the default board changed since", "default", 0],
    ["another board changed since", "new", 1],
  ])("answers 409 and changes nothing when %s", async (_, which, version) => {
    const { post, create } = await session()
    const id = which === "default" ? "default" : (await create("Design")).id
    await post("/api/boards/update", update(id, version, { name: "First" }))
    const before = await storedBoards()

    const response = await post("/api/boards/update", update(id, version, { name: "Second" }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "board_changed" })
    expect(await storedBoards()).toEqual(before)
  })

  it("lets only one of two members store the default board first", async () => {
    const forgejo = createFakeForgejo({ orgs: [boardsOrg()], otherUsers: [grace] })
    const clock = createFakeClock().clock
    const plain = tabulo(forgejo.fetch, { clock })
    const ada = await signIn(plain, forgejo)
    const graceCookie = await signIn(plain, forgejo, "grace")
    // Both requests read version 0 before either writes.
    const racing = tabulo(forgejo.fetch, {
      clock,
      vars: { DB: holdStatements(env.DB, "INSERT INTO boards", barrier(2)) },
    })

    const responses = await Promise.all([
      postJson(racing, ada, "/api/boards/update", update("default", 0, { name: "Ada's" })),
      postJson(
        racing,
        graceCookie,
        "/api/boards/update",
        update("default", 0, { name: "Grace's" }),
      ),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(await storedBoards()).toEqual([expect.objectContaining({ id: "default", version: 1 })])
  })

  it("answers 404 board_not_found to an update that a delete got to first", async () => {
    const forgejo = createFakeForgejo({ orgs: [boardsOrg()], otherUsers: [grace] })
    const clock = createFakeClock().clock
    const plain = tabulo(forgejo.fetch, { clock })
    const ada = await signIn(plain, forgejo)
    const graceCookie = await signIn(plain, forgejo, "grace")
    const created = await postJson(plain, ada, "/api/boards", {
      org: "acme",
      name: "Design",
      repos: ["api"],
    })
    const { id } = ((await created.json()) as { board: SavedBoard }).board
    const graceDeletes = async () => {
      const deleted = await postJson(plain, graceCookie, "/api/boards/delete", {
        org: "acme",
        board: id,
        version: 1,
      })
      expect(deleted.status).toBe(200)
    }
    const updater = tabulo(forgejo.fetch, {
      clock,
      vars: { DB: holdStatements(env.DB, "UPDATE boards", graceDeletes) },
    })

    const response = await postJson(updater, ada, "/api/boards/update", update(id, 1))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: "There is no such board",
      code: "board_not_found",
    })
    expect(await storedBoards()).toEqual([])
  })

  it.each([
    ["an unknown board", "abcd1234"],
    ["text that cannot be a board id", "not-a-board"],
  ])("answers 404 board_not_found to %s", async (_, board) => {
    const { post } = await session()

    const response = await post("/api/boards/update", update(board, 1))

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "board_not_found" })
    expect(await storedBoards()).toEqual([])
  })

  it("answers 403 to someone outside the organization before looking for the board", async () => {
    const { post, linus } = await session()

    const unknown = await post("/api/boards/update", update("abcd1234", 1), linus)
    const known = await post("/api/boards/update", update("default", 0), linus)

    expect([unknown.status, known.status]).toEqual([403, 403])
    expect(await storedBoards()).toEqual([])
  })

  it.each([
    ["an empty column key", { columns: [""] }],
    ["a column key of 201 characters", { hidden: ["x".repeat(201)] }],
    ["a column key twice", { columns: ["todo", "todo"] }],
    ["a negative version", { version: -1 }],
    ["a repository twice in other case", { repos: ["web", "Web"] }],
    ["no dropUnreadable", { dropUnreadable: undefined }],
  ])("answers 400 to %s and stores nothing", async (_, fields) => {
    const { post } = await session()

    const response = await post("/api/boards/update", update("default", 0, fields))

    expect(response.status).toBe(400)
    expect(await storedBoards()).toEqual([])
  })

  it("keeps a column key the organization has no column for", async () => {
    const { post } = await session()

    const response = await post(
      "/api/boards/update",
      update("default", 0, { columns: ["Status/Shipped", "todo"], hidden: ["Status/Shipped"] }),
    )

    expect(await response.json()).toMatchObject({
      board: { columns: ["Status/Shipped", "todo"], hidden: ["Status/Shipped"] },
    })
  })

  it("answers 400 to a repository the user cannot read, before storing anything", async () => {
    const { post, grace } = await session()

    const response = await post(
      "/api/boards/update",
      update("default", 0, { repos: ["api", "secret"] }),
      grace,
    )

    expect(response.status).toBe(400)
    expect(await storedBoards()).toEqual([])
  })
})

describe("POST /api/boards/delete", () => {
  it("deletes a board and keeps the card order", async () => {
    const { get, post, create } = await session()
    const board = await create("Design")
    await get(`/api/board?org=acme`)
    const ranks = async () =>
      (await env.DB.prepare("SELECT * FROM card_ranks ORDER BY issue_key").all()).results
    const before = await ranks()

    const response = await post("/api/boards/delete", { org: "acme", board: board.id, version: 1 })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(await listed(await get("/api/boards?org=acme"))).toEqual([
      { id: "default", name: "Board" },
    ])
    expect(before).not.toEqual([])
    expect(await ranks()).toEqual(before)
  })

  it.each(["default", "DEFAULT"])(
    "answers 400 to deleting the default board as %s",
    async (board) => {
      const { post } = await session()
      await post("/api/boards/update", update("default", 0))

      const response = await post("/api/boards/delete", { org: "acme", board, version: 1 })

      expect(response.status).toBe(400)
      expect(await storedBoards()).toHaveLength(1)
    },
  )

  it("answers 409 to a stale version and 404 to an unknown board", async () => {
    const { post, create } = await session()
    const board = await create("Design")
    await post("/api/boards/update", update(board.id, 1))

    const stale = await post("/api/boards/delete", { org: "acme", board: board.id, version: 1 })
    const unknown = await post("/api/boards/delete", { org: "acme", board: "abcd1234", version: 1 })
    const malformed = await post("/api/boards/delete", { org: "acme", board: "x", version: 1 })

    expect(stale.status).toBe(409)
    expect([unknown.status, malformed.status]).toEqual([404, 404])
    expect(await unknown.json()).toMatchObject({ code: "board_not_found" })
    expect(await storedBoards()).toEqual([expect.objectContaining({ id: board.id, version: 2 })])
  })

  it("answers 403 to someone outside the organization", async () => {
    const { post, create, linus } = await session()
    const board = await create("Design")

    const response = await post(
      "/api/boards/delete",
      { org: "acme", board: board.id, version: 1 },
      linus,
    )

    expect(response.status).toBe(403)
    expect(await storedBoards()).toHaveLength(1)
  })
})

type BoardAnswer = {
  org: string
  board: SavedBoard
  viewerCanArrange: boolean
  columns: Array<{ key: string }>
  allColumns: Array<{ key: string }>
  cards: Array<{ key: string; column: string; rank: string }>
  failedRepos: Array<{ repo: string; message: string }>
}

const answer = async (response: Response) => {
  expect(response.status).toBe(200)
  return (await response.json()) as BoardAnswer
}

const keys = (columns: ReadonlyArray<{ key: string }>) => columns.map((column) => column.key)

/** The cards of `column` in the order everyone sees them. */
const order = (board: BoardAnswer, column: string) =>
  board.cards
    .filter((card) => card.column === column)
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.key < b.key ? -1 : 1))
    .map((card) => card.key)

const rankRows = async () =>
  (
    await env.DB.prepare(
      "SELECT issue_key, column_key, rank FROM card_ranks ORDER BY issue_key",
    ).all()
  ).results

const moveBody = (
  repo: string,
  number: number,
  fromColumn: string,
  toColumn: string,
  afterKey: string | null = null,
) => ({ org: "acme", repo, number, fromColumn, toColumn, afterKey, beforeKey: null })

describe("GET /api/board", () => {
  it("opens the default board with the organization's repositories that are not archived", async () => {
    const org = boardsOrg()
    org.repos.push(
      boardRepo("old", { archived: true, issues: [boardIssue("old", 9, { title: "Archived" })] }),
    )
    const { get } = await session({ orgs: [org] })

    const board = await answer(await get("/api/board?org=acme"))

    expect(board.board).toEqual({
      id: "default",
      name: "Board",
      repos: ["api", "secret", "Web"],
      unreadableRepos: 0,
      columns: [],
      hidden: [],
      version: 0,
    })
    expect(board.cards.map((card) => card.key).sort()).toEqual([
      "acme/api#1",
      "acme/api#2",
      "acme/secret#4",
      "acme/web#3",
    ])
    expect(await storedBoards()).toEqual([])
  })

  it("derives an unchanged default board's repositories for each viewer", async () => {
    const { get, grace } = await session()

    const response = await get("/api/board?org=acme", grace)

    const text = await response.text()
    expect(text).not.toMatch(/secret|Acquisition/i)
    expect((JSON.parse(text) as BoardAnswer).board).toMatchObject({
      repos: ["api", "Web"],
      unreadableRepos: 0,
    })
  })

  it("opens the default board without repositories when the organization has more than 20", async () => {
    const repos = Array.from({ length: 21 }, (_, i) =>
      boardRepo(`r${i}`, { issues: [boardIssue(`r${i}`, 1)] }),
    )
    const { get } = await session({ orgs: [acme(repos)] })

    const board = await answer(await get("/api/board?org=acme"))

    expect(board.board.repos).toEqual([])
    expect(board.cards).toEqual([])
  })

  it("orders an unchanged default board's columns as BOARD_COLUMNS says and hides none", async () => {
    const { get } = await session({}, { BOARD_COLUMNS: "Status/In Progress, Todo" })

    const board = await answer(await get("/api/board?org=acme"))

    expect(board.board).toMatchObject({ columns: ["Status/In Progress", "todo"], hidden: [] })
    const laidOut = ["Status/In Progress", "todo", "Status/Backlog", "Status/Review", "done"]
    expect(keys(board.allColumns)).toEqual(laidOut)
    expect(keys(board.columns)).toEqual(laidOut)
  })

  it("opens another board by its id, whatever its case, with its own repositories", async () => {
    const { get, create } = await session()
    const design = await create("Design", ["web"])

    const board = await answer(await get(`/api/board?org=acme&board=${design.id.toUpperCase()}`))

    expect(board.board).toMatchObject({ id: design.id, name: "Design", repos: ["Web"] })
    expect(board.cards.map((card) => card.key)).toEqual(["acme/web#3"])
  })

  it("ignores the old repos parameter", async () => {
    const { get } = await session()

    const board = await answer(await get("/api/board?org=acme&repos=api"))

    expect(board.board.repos).toEqual(["api", "secret", "Web"])
    expect(board.cards.map((card) => card.key)).toContain("acme/web#3")
  })

  it.each([
    ["an unknown board", "abcd1234"],
    ["text that cannot be a board id", "no/such board"],
    ["an empty board id", ""],
  ])("answers 404 board_not_found to %s once Forgejo shows the organization", async (_, id) => {
    const { forgejo, get } = await session()

    const response = await get(`/api/board?org=acme&board=${encodeURIComponent(id)}`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: "There is no such board",
      code: "board_not_found",
    })
    expect(forgejo.requests.some((r) => r.path === "/api/v1/orgs/acme")).toBe(true)
  })

  it.each([
    ["the default board", "default"],
    ["a stored board", "stored"],
    ["an unknown board", "abcd1234"],
    ["text that cannot be a board id", "no/such board"],
  ])(
    "answers 404 without board_not_found for %s of an organization Forgejo does not show",
    async (_, which) => {
      const { get, create, linus } = await session({
        orgs: [{ ...boardsOrg(), hiddenFrom: ["linus"] }],
      })
      const id = which === "stored" ? (await create("Design")).id : which

      const response = await get(`/api/board?org=acme&board=${encodeURIComponent(id)}`, linus)

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: "Not found in Forgejo, or you cannot see it" })
    },
  )

  it("leaves the cards of hidden columns off the board and keeps their ranks", async () => {
    const { clock, get, post } = await session()
    await get("/api/board?org=acme")
    const before = await rankRows()
    clock.advance(60_000)
    await post(
      "/api/boards/update",
      update("default", 0, {
        repos: ["api", "web"],
        hidden: ["Status/In Progress", "Status/Nope"],
      }),
    )

    const board = await answer(await get("/api/board?org=acme"))

    expect(board.board.hidden).toEqual(["Status/In Progress", "Status/Nope"])
    expect(keys(board.allColumns)).toEqual([
      "todo",
      "Status/Backlog",
      "Status/In Progress",
      "Status/Review",
      "done",
    ])
    expect(keys(board.columns)).toEqual(["todo", "Status/Backlog", "Status/Review", "done"])
    expect(board.cards.map((card) => card.key).sort()).toEqual(["acme/api#1", "acme/web#3"])
    expect(before).toContainEqual(expect.objectContaining({ issue_key: "acme/api#2" }))
    expect(await rankRows()).toEqual(before)
  })

  it("ranks a card that reaches a hidden column, so it keeps its place once shown", async () => {
    const { forgejo, clock, get, post } = await session()
    await post(
      "/api/boards/update",
      update("default", 0, { repos: ["api", "web"], hidden: ["Status/In Progress"] }),
    )
    await get("/api/board?org=acme")
    clock.advance(60_000)
    const issue = forgejo.issue("acme", "api", 1)
    if (issue === undefined) throw new Error("fixture has no acme/api#1")
    issue.labels = [inProgress]

    const hidden = await answer(await get("/api/board?org=acme"))
    const ranked = (await rankRows()).find((row) => row.issue_key === "acme/api#1")
    await post("/api/boards/update", update("default", 1, { repos: ["api", "web"] }))
    const shown = await answer(await get("/api/board?org=acme"))

    expect(hidden.cards.map((card) => card.key)).toEqual(["acme/web#3"])
    expect(ranked).toMatchObject({ column_key: "Status/In Progress" })
    expect(shown.cards.find((card) => card.key === "acme/api#1")).toMatchObject({
      column: "Status/In Progress",
      rank: ranked?.rank,
    })
  })

  it("moves a card into a hidden column, which leaves it off the board", async () => {
    const { forgejo, get, post } = await session()
    await post("/api/boards/update", update("default", 0, { repos: ["api"], hidden: ["done"] }))
    await get("/api/board?org=acme")

    const moved = await post("/api/board/move", moveBody("api", 1, "todo", "done"))

    expect(moved.status).toBe(200)
    expect(forgejo.issue("acme", "api", 1)?.state).toBe("closed")
    const board = await answer(await get("/api/board?org=acme"))
    expect(board.cards.map((card) => card.key)).toEqual(["acme/api#2"])
    expect((await rankRows()).find((row) => row.issue_key === "acme/api#1")).toMatchObject({
      column_key: "done",
    })
  })

  it("skips a stored key without a column and places it once the organization has the label", async () => {
    const { get, post } = await session()
    await post(
      "/api/boards/update",
      update("default", 0, { columns: ["Status/Shipped", "done", "Status/Review", "todo"] }),
    )

    const before = await answer(await get("/api/board?org=acme"))
    const withLabel = boardsOrg()
    withLabel.labels = [...withLabel.labels, { ...backlog, id: 40, name: "Status/Shipped" }]
    const later = createFakeForgejo({ orgs: [withLabel] })
    const laterCall = tabulo(later.fetch, { clock: createFakeClock().clock })
    const after = await answer(
      await laterCall("/api/board?org=acme", {
        headers: { cookie: await signIn(laterCall, later) },
      }),
    )

    expect(before.board.columns).toEqual(["Status/Shipped", "done", "Status/Review", "todo"])
    // Status labels the order does not list come before Done.
    expect(keys(before.allColumns)).toEqual([
      "Status/Backlog",
      "Status/In Progress",
      "done",
      "Status/Review",
      "todo",
    ])
    expect(keys(after.allColumns)).toEqual([
      "Status/Shipped",
      "Status/Backlog",
      "Status/In Progress",
      "done",
      "Status/Review",
      "todo",
    ])
  })
})

describe("repositories a member cannot read", () => {
  const storeAllThree = async (post: (path: string, body: unknown) => Promise<Response>) => {
    const stored = await post(
      "/api/boards/update",
      update("default", 0, { repos: ["api", "secret", "web"] }),
    )
    expect(stored.status).toBe(200)
  }

  it("are left out of every answer unnamed, counted, and kept by another member's change", async () => {
    const { get, post, grace } = await session()
    await storeAllThree(post)
    const unnamed = async (response: Response) => {
      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).not.toMatch(/secret|Acquisition/i)
      return JSON.parse(text) as { board: SavedBoard }
    }

    const graceBoard = (await unnamed(await get("/api/board?org=acme", grace))) as BoardAnswer
    await unnamed(await get("/api/boards?org=acme", grace))
    const graceUpdate = await unnamed(
      await post("/api/boards/update", update("default", 1, { repos: ["web"] }), grace),
    )
    const adaBoard = await answer(await get("/api/board?org=acme"))

    expect(graceBoard.board).toMatchObject({ repos: ["api", "Web"], unreadableRepos: 1 })
    expect(graceBoard.failedRepos).toEqual([])
    expect(graceBoard.cards.map((card) => card.key).sort()).toEqual([
      "acme/api#1",
      "acme/api#2",
      "acme/web#3",
    ])
    expect(graceUpdate.board).toMatchObject({ repos: ["Web"], unreadableRepos: 1, version: 2 })
    expect(adaBoard.board).toMatchObject({ repos: ["Web", "secret"], unreadableRepos: 0 })
    expect(adaBoard.cards.map((card) => card.key).sort()).toEqual(["acme/secret#4", "acme/web#3"])
  })

  it("stay unnamed when their own read fails, and are named to a member who can read them", async () => {
    let failing = false
    const { get, post, grace } = await session({
      intercept: (method, path) =>
        failing && method === "GET" && path === "/api/v1/repos/acme/secret"
          ? new Response("unavailable", { status: 503 })
          : undefined,
    })
    await storeAllThree(post)
    failing = true

    const graceResponse = await get("/api/board?org=acme", grace)
    const graceText = await graceResponse.text()
    const adaBoard = await answer(await get("/api/board?org=acme"))

    expect(graceResponse.status).toBe(200)
    expect(graceText).not.toMatch(/secret|Acquisition/i)
    expect(JSON.parse(graceText)).toMatchObject({
      board: { repos: ["api", "Web"], unreadableRepos: 1 },
      failedRepos: [],
    })
    expect(adaBoard.board).toMatchObject({ repos: ["api", "secret", "Web"], unreadableRepos: 0 })
    expect(adaBoard.failedRepos).toEqual([
      { repo: "secret", message: "Forgejo had a problem (HTTP 503); try again in a moment" },
    ])
  })

  it("stay unnamed when their own read and the organization's listing both fail", async () => {
    let failing = false
    const { get, post } = await session({
      intercept: (method, path) =>
        failing &&
        method === "GET" &&
        (path === "/api/v1/repos/acme/secret" || path === "/api/v1/orgs/acme/repos")
          ? new Response("unavailable", { status: 503 })
          : undefined,
    })
    await storeAllThree(post)
    failing = true

    const response = await get("/api/board?org=acme")
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).not.toMatch(/secret|Acquisition/i)
    expect(JSON.parse(text)).toMatchObject({
      board: { repos: ["api", "Web"], unreadableRepos: 1 },
      failedRepos: [],
    })
  })

  it("keep their rank rows when a member who cannot read them loads the board", async () => {
    const { get, post, grace } = await session()
    await storeAllThree(post)
    await get("/api/board?org=acme")
    const before = await rankRows()

    await answer(await get("/api/board?org=acme", grace))

    expect(before).toContainEqual(expect.objectContaining({ issue_key: "acme/secret#4" }))
    expect(await rankRows()).toEqual(before)
  })

  it("count toward the 20 repositories until a member drops them", async () => {
    const names = Array.from({ length: 20 }, (_, i) => `r${i}`)
    const repos = [
      ...names.map((name) => boardRepo(name)),
      boardRepo("secret", { hiddenFrom: ["grace"] }),
    ]
    const { post, grace } = await session({ orgs: [acme(repos)] })
    const stored = await post(
      "/api/boards/update",
      update("default", 0, { repos: [...names.slice(0, 19), "secret"] }),
    )
    expect(stored.status).toBe(200)

    const tooMany = await post("/api/boards/update", update("default", 1, { repos: names }), grace)
    const tooManyText = await tooMany.text()
    const kept = await post(
      "/api/boards/update",
      update("default", 1, { repos: names.slice(0, 19) }),
      grace,
    )
    const dropped = await post(
      "/api/boards/update",
      update("default", 2, { repos: names, dropUnreadable: true }),
      grace,
    )

    expect(tooMany.status).toBe(400)
    expect(tooManyText).toContain("1 repositories you cannot read")
    expect(tooManyText).not.toContain("secret")
    expect(await kept.json()).toMatchObject({ board: { unreadableRepos: 1, version: 2 } })
    expect(await dropped.json()).toMatchObject({
      board: { repos: names, unreadableRepos: 0, version: 3 },
    })
    expect(await storedBoards()).toEqual([
      expect.objectContaining({ repos: JSON.stringify(names) }),
    ])
  })

  it("are removed when a member asks to drop them", async () => {
    const { get, post, grace } = await session()
    await storeAllThree(post)

    const response = await post(
      "/api/boards/update",
      update("default", 1, { repos: ["web"], dropUnreadable: true }),
      grace,
    )
    const adaBoard = await answer(await get("/api/board?org=acme"))

    expect(await response.json()).toMatchObject({ board: { repos: ["Web"], unreadableRepos: 0 } })
    expect(adaBoard.board.repos).toEqual(["Web"])
  })
})

describe("across boards", () => {
  it("shows a move made from one board on every board, in one order", async () => {
    const { get, post, create } = await session()
    const apiOnly = await create("API", ["api"])
    await get(`/api/board?org=acme&board=${apiOnly.id}`)

    const moved = await post(
      "/api/board/move",
      moveBody("api", 1, "todo", "Status/In Progress", "acme/api#2"),
    )

    expect(moved.status).toBe(200)
    const onApiBoard = await answer(await get(`/api/board?org=acme&board=${apiOnly.id}`))
    const onDefault = await answer(await get("/api/board?org=acme"))
    expect(order(onApiBoard, "Status/In Progress")).toEqual(["acme/api#2", "acme/api#1"])
    expect(order(onDefault, "Status/In Progress")).toEqual(["acme/api#2", "acme/api#1"])
  })
})
