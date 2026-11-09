import { env } from "cloudflare:workers"
import { beforeEach, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo } from "./fake-forgejo.ts"
import { acme, boardIssue, boardRepo, grace, inProgress } from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

type Row = { issue_key: string; column_key: string; rank: string; updated_by: string }

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
    env.DB.prepare("DELETE FROM card_ranks"),
    env.DB.prepare("DELETE FROM boards"),
  ])
})

const rankRows = async () =>
  (
    await env.DB.prepare(
      "SELECT issue_key, column_key, rank, updated_by FROM card_ranks ORDER BY issue_key",
    ).all<Row>()
  ).results

/** A D1 whose first card_ranks SELECT waits for `beforeFirstRead` before it runs. */
const hookRankReads = (db: D1Database, beforeFirstRead: () => Promise<void>): D1Database => {
  let hooked = false
  const passthrough = (target: object) => (t: object, p: string | symbol) => {
    const v: unknown = Reflect.get(t, p)
    return typeof v === "function" ? v.bind(target) : v
  }
  return new Proxy(db, {
    get: (target, property) => {
      if (property !== "prepare") return passthrough(target)(target, property)
      return (sql: string) => {
        const statement = target.prepare(sql)
        if (!sql.includes("FROM card_ranks WHERE org") || hooked) return statement
        hooked = true
        return new Proxy(statement, {
          get: (st, prop) => {
            if (prop !== "bind") return passthrough(st)(st, prop)
            return (...args: Array<unknown>) => {
              const bound = st.bind(...args)
              return new Proxy(bound, {
                get: (bt, p) => {
                  if (p !== "all") return passthrough(bt)(bt, p)
                  return async () => {
                    await beforeFirstRead()
                    return bt.all()
                  }
                },
              })
            }
          },
        })
      }
    },
  })
}

const raceOrg = () =>
  acme([
    boardRepo("api", {
      writers: ["ada", "grace"],
      issues: [
        boardIssue("api", 1, { updated_at: "2026-11-04T00:00:00Z" }),
        boardIssue("api", 2, { updated_at: "2026-11-01T00:00:00Z" }),
        boardIssue("api", 9, { updated_at: "2026-11-06T00:00:00Z" }),
      ],
    }),
    boardRepo("web", {
      writers: ["ada", "grace"],
      issues: [boardIssue("web", 3, { labels: [inProgress] })],
    }),
  ])

const staleListing = (issues: ReadonlyArray<unknown>) =>
  new Response(JSON.stringify(issues), {
    headers: { "content-type": "application/json", "x-total-count": String(issues.length) },
  })

it("keeps the column and rank a move stored while a board read was in flight", async () => {
  let stale = false
  const forgejo = createFakeForgejo({
    orgs: [raceOrg()],
    otherUsers: [grace],
    intercept: (method, path) =>
      // The reader's listing of acme/api as it was before the move: api#1 still in Todo.
      stale && method === "GET" && path === "/api/v1/repos/acme/api/issues"
        ? staleListing([boardIssue("api", 1), boardIssue("api", 2), boardIssue("api", 9)])
        : undefined,
  })
  const clock = createFakeClock()
  const plain = tabulo(forgejo.fetch, { clock: clock.clock })
  const ada = await signIn(plain, forgejo)
  const graceCookie = await signIn(plain, forgejo, "grace")
  // Seed every row.
  await plain("/api/board?org=acme", { headers: { cookie: ada } })

  const graceMoves = async () => {
    const response = await plain("/api/board/move", {
      method: "POST",
      headers: {
        cookie: graceCookie,
        origin: "https://tabulo.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        org: "acme",
        repo: "api",
        number: 1,
        fromColumn: "todo",
        toColumn: "Status/In Progress",
        afterKey: null,
        beforeKey: "acme/web#3",
      }),
    })
    expect(response.status).toBe(200)
  }
  const reader = tabulo(forgejo.fetch, {
    clock: clock.clock,
    vars: { DB: hookRankReads(env.DB, graceMoves) },
  })
  stale = true
  const response = await reader("/api/board?org=acme", { headers: { cookie: ada } })
  stale = false
  expect(response.status).toBe(200)

  const rows = await rankRows()
  const api1 = rows.find((row) => row.issue_key === "acme/api#1")
  const web3 = rows.find((row) => row.issue_key === "acme/web#3")
  // Grace's move put api#1 in In Progress above web#3. The reader must not undo that.
  expect(api1).toMatchObject({ column_key: "Status/In Progress", updated_by: "grace" })
  expect(api1 !== undefined && web3 !== undefined && api1.rank < web3.rank).toBe(true)
})

it("keeps the row a move stored for an issue that a board read in flight had not listed", async () => {
  let stale = false
  const forgejo = createFakeForgejo({
    orgs: [raceOrg()],
    otherUsers: [grace],
    intercept: (method, path) =>
      // The reader's listing of acme/api as it was before api#9 existed.
      stale && method === "GET" && path === "/api/v1/repos/acme/api/issues"
        ? staleListing([boardIssue("api", 1), boardIssue("api", 2)])
        : undefined,
  })
  const clock = createFakeClock()
  const plain = tabulo(forgejo.fetch, { clock: clock.clock })
  const ada = await signIn(plain, forgejo)
  const graceCookie = await signIn(plain, forgejo, "grace")
  // No seed: the reader's run is the first; grace's move during it stores api#9's row.
  const graceMoves = async () => {
    const response = await plain("/api/board/move", {
      method: "POST",
      headers: {
        cookie: graceCookie,
        origin: "https://tabulo.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        org: "acme",
        repo: "api",
        number: 9,
        fromColumn: "todo",
        toColumn: "Status/In Progress",
        afterKey: null,
        beforeKey: null,
      }),
    })
    expect(response.status).toBe(200)
  }
  const reader = tabulo(forgejo.fetch, {
    clock: clock.clock,
    vars: { DB: hookRankReads(env.DB, graceMoves) },
  })
  stale = true
  const response = await reader("/api/board?org=acme", { headers: { cookie: ada } })
  stale = false
  expect(response.status).toBe(200)

  const rows = await rankRows()
  expect(rows.map((row) => row.issue_key)).toContain("acme/api#9")
})

it("answers 409 without writing when the card left the column the client saw", async () => {
  const forgejo = createFakeForgejo({ orgs: [raceOrg()], otherUsers: [grace] })
  const clock = createFakeClock()
  const plain = tabulo(forgejo.fetch, { clock: clock.clock })
  const ada = await signIn(plain, forgejo)
  await plain("/api/board?org=acme", { headers: { cookie: ada } })
  // Grace moves api#1 to In Progress in Forgejo itself (or any client) after ada's board loaded.
  const issue = forgejo.issue("acme", "api", 1)
  if (issue === undefined) throw new Error("no api#1")
  issue.labels = [inProgress]

  // Ada still sees api#1 in Todo and drags it above api#2 within Todo.
  const response = await plain("/api/board/move", {
    method: "POST",
    headers: { cookie: ada, origin: "https://tabulo.example", "content-type": "application/json" },
    body: JSON.stringify({
      org: "acme",
      repo: "api",
      number: 1,
      fromColumn: "todo",
      toColumn: "todo",
      afterKey: null,
      beforeKey: "acme/api#2",
    }),
  })
  const writesSent = forgejo.requests
    .filter((r) => r.method !== "GET" && r.path.startsWith("/api/v1/"))
    .map((r) => `${r.method} ${r.path}`)
  expect(response.status).toBe(409)
  expect(writesSent).toEqual([])
})
