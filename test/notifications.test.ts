import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeForgejo, type FakeForgejoFixtures } from "./fake-forgejo.ts"
import { unreadNotification } from "./fixtures.ts"
import { APP_URL, postJson, signIn, tabulo } from "./harness.ts"

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
  ])
})

const setup = async (overrides: Partial<FakeForgejoFixtures> = {}) => {
  const forgejo = createFakeForgejo({ notifications: [unreadNotification], ...overrides })
  const call = tabulo(forgejo.fetch)
  const cookie = await signIn(call, forgejo)
  const threadWrites = () =>
    forgejo.requests.filter((request) => request.path.startsWith("/api/v1/notifications/threads"))
  return { forgejo, call, cookie, threadWrites }
}

describe("POST /api/notifications/read", () => {
  it("marks the thread read in Forgejo with the signed-in user's token", async () => {
    const { call, cookie, threadWrites } = await setup()

    const response = await postJson(call, cookie, "/api/notifications/read", { id: 55 })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(
      threadWrites().map((request) => ({
        method: request.method,
        path: request.path,
        query: Object.fromEntries(request.query),
        authorization: request.authorization,
      })),
    ).toEqual([
      {
        method: "PATCH",
        path: "/api/v1/notifications/threads/55",
        query: { "to-status": "read" },
        authorization: "Bearer access-1",
      },
    ])
    const dashboard = await call("/api/dashboard", { headers: { cookie } })
    expect(((await dashboard.json()) as { notifications: unknown }).notifications).toEqual({
      _tag: "Loaded",
      items: [],
      total: 0,
    })
  })

  it("answers 401 without a session and writes nothing", async () => {
    const { call, threadWrites } = await setup()

    const response = await call("/api/notifications/read", {
      method: "POST",
      headers: { origin: APP_URL, "content-type": "application/json" },
      body: JSON.stringify({ id: 55 }),
    })

    expect(response.status).toBe(401)
    expect(threadWrites()).toEqual([])
  })

  it.each([
    ["missing", {}],
    ["zero", { id: 0 }],
    ["negative", { id: -55 }],
    ["fractional", { id: 5.5 }],
    ["text", { id: "55" }],
  ])("answers 400 to a %s id and writes nothing", async (_, body) => {
    const { call, cookie, threadWrites } = await setup()

    const response = await postJson(call, cookie, "/api/notifications/read", body)

    expect(response.status).toBe(400)
    expect(threadWrites()).toEqual([])
  })

  it("answers 403 when Forgejo refuses, as for a grant without write:notification", async () => {
    const { call, cookie } = await setup({ notificationScope: "read" })

    const response = await postJson(call, cookie, "/api/notifications/read", { id: 55 })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "Forgejo did not allow this" })
  })

  it("answers 404 for a thread Forgejo does not have", async () => {
    const { call, cookie } = await setup()

    const response = await postJson(call, cookie, "/api/notifications/read", { id: 56 })

    expect(response.status).toBe(404)
  })

  it.each([
    ["another origin", { origin: "https://elsewhere.example" }],
    ["no origin", {}],
  ])("refuses a request from %s and writes nothing", async (_, origin) => {
    const { call, cookie, threadWrites } = await setup()

    const response = await call("/api/notifications/read", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", ...origin },
      body: JSON.stringify({ id: 55 }),
    })

    expect(response.status).toBe(403)
    expect(threadWrites()).toEqual([])
  })
})
