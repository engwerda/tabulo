import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeForgejo } from "./fake-forgejo.ts"
import { assignedIssue, createdIssue, reviewRequestPull } from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

const closedIssue = { ...createdIssue, number: 99, title: "Rate limit docs", state: "closed" }
const openIssue = { ...assignedIssue, number: 7, title: "Rate limit the webhook" }

const setup = async (overrides: Parameters<typeof createFakeForgejo>[0] = {}) => {
  const forgejo = createFakeForgejo({
    issues: {
      review_requested: [reviewRequestPull],
      assigned: [openIssue],
      created: [closedIssue],
    },
    ...overrides,
  })
  const call = tabulo(forgejo.fetch)
  const cookie = await signIn(call, forgejo)
  return { forgejo, get: (path: string) => call(path, { headers: { cookie } }) }
}

const searches = (forgejo: ReturnType<typeof createFakeForgejo>) =>
  forgejo.requests.filter((r) => r.path === "/api/v1/repos/issues/search")

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
  ])
})

describe("GET /api/search", () => {
  it("returns 401 without a session", async () => {
    const response = await tabulo(createFakeForgejo().fetch)("/api/search?q=rate")
    expect(response.status).toBe(401)
  })

  it("lists matching issues and pull requests, open ones before closed ones", async () => {
    const { get } = await setup()

    const response = await get("/api/search?q=rate%20limit")

    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: Array<Record<string, unknown>> }
    expect(body.items.map(({ kind, repo, number, state }) => [kind, repo, number, state])).toEqual([
      ["pull", "acme/api", 42, "open"],
      ["issue", "acme/web", 7, "open"],
      ["issue", "acme/web", 99, "closed"],
    ])
  })

  it("asks Forgejo as the user for open matches, then closed ones for the rest of the limit", async () => {
    const { forgejo, get } = await setup()

    await get("/api/search?q=rate&limit=5")

    expect(searches(forgejo).map((r) => Object.fromEntries(r.query))).toEqual([
      { q: "rate", state: "open", limit: "5" },
      { q: "rate", state: "closed", limit: "3" },
    ])
    expect(searches(forgejo).every((r) => r.authorization?.startsWith("Bearer "))).toBe(true)
  })

  it("skips the closed search when open matches fill the limit", async () => {
    const { forgejo, get } = await setup()

    const response = await get("/api/search?q=rate&limit=2")

    expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(2)
    expect(searches(forgejo)).toHaveLength(1)
  })

  it("finds nothing for a query no title contains", async () => {
    const { get } = await setup()
    const response = await get("/api/search?q=zebra")
    expect(await response.json()).toEqual({ items: [] })
  })

  it("trims the query and caps the limit at 20", async () => {
    const { forgejo, get } = await setup()

    const response = await get(`/api/search?q=${encodeURIComponent("  rate  ")}&limit=500`)

    expect(response.status).toBe(200)
    expect(searches(forgejo)[0]?.query.get("q")).toBe("rate")
    expect(searches(forgejo)[0]?.query.get("limit")).toBe("20")
  })

  it.each([
    ["no q", "/api/search"],
    ["an empty q", "/api/search?q="],
    ["a blank q", "/api/search?q=%20%20"],
    ["a q over 100 characters", `/api/search?q=${"a".repeat(101)}`],
    ["a limit of zero", "/api/search?q=rate&limit=0"],
    ["a limit that is no number", "/api/search?q=rate&limit=many"],
  ])("answers 400 to %s without asking Forgejo", async (_name, path) => {
    const { forgejo, get } = await setup()
    const response = await get(path)
    expect(response.status).toBe(400)
    expect(searches(forgejo)).toHaveLength(0)
  })

  it("accepts a q of exactly 100 characters", async () => {
    const { get } = await setup()
    expect((await get(`/api/search?q=${"a".repeat(100)}`)).status).toBe(200)
  })

  it("answers 502 when Forgejo fails", async () => {
    const { get } = await setup({
      intercept: (_method, path) =>
        path === "/api/v1/repos/issues/search" ? new Response("{}", { status: 500 }) : undefined,
    })
    expect((await get("/api/search?q=rate")).status).toBe(502)
  })
})
