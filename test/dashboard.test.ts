import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo } from "./fake-forgejo.ts"
import { assignedIssue, createdIssue, reviewRequestPull, unreadNotification } from "./fixtures.ts"
import { APP_URL, signIn, tabulo } from "./harness.ts"

const refreshGrants = (forgejo: ReturnType<typeof createFakeForgejo>) =>
  forgejo.requests
    .filter((r) => r.form.get("grant_type") === "refresh_token")
    .map((r) => r.form.get("refresh_token"))

const sessionCount = async () =>
  (await env.DB.prepare("SELECT count(*) AS n FROM sessions").first<{ n: number }>())?.n

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
  ])
})

describe("GET /api/dashboard", () => {
  it("returns 401 without a session", async () => {
    const response = await tabulo(createFakeForgejo().fetch)("/api/dashboard")
    expect(response.status).toBe(401)
  })

  it("maps Forgejo issues and notifications, and isolates a failing section", async () => {
    const forgejo = createFakeForgejo({
      issues: {
        review_requested: [reviewRequestPull],
        assigned: [assignedIssue],
        created: [createdIssue],
      },
      totals: { assigned: 12 },
      notifications: [unreadNotification],
      failingSearches: ["mentioned"],
    })
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/dashboard", { headers: { cookie } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      user: {
        login: "ada",
        name: "Ada Lovelace",
        avatarUrl: "https://forgejo.example/avatars/ada",
      },
      reviewRequests: {
        _tag: "Loaded",
        total: 1,
        items: [
          {
            kind: "pull",
            repo: "acme/api",
            number: 42,
            title: "Add rate limiting to the public API",
            url: "https://forgejo.example/acme/api/pulls/42",
            state: "open",
            labels: [
              { name: "Status/In Review", color: "#fbca04" },
              { name: "Kind/Feature", color: "#0e8a16" },
            ],
            author: "grace",
            updatedAt: "2026-11-06T16:30:00Z",
            comments: 3,
          },
        ],
      },
      assigned: {
        _tag: "Loaded",
        total: 12,
        items: [
          {
            kind: "issue",
            repo: "acme/web",
            number: 7,
            title: "Dark mode flickers on load",
            url: "https://forgejo.example/acme/web/issues/7",
            state: "open",
            labels: [],
            author: "ada",
            updatedAt: "2026-11-05T11:15:00Z",
            comments: 0,
          },
        ],
      },
      mentioned: { _tag: "Failed", message: "Forgejo returned HTTP 500" },
      created: {
        _tag: "Loaded",
        total: 1,
        items: [
          {
            kind: "issue",
            repo: "acme/web",
            number: 8,
            title: "Document the release process",
            url: "https://forgejo.example/acme/web/issues/8",
            state: "open",
            labels: [],
            author: "ada",
            updatedAt: "2026-11-04T10:00:00Z",
            comments: 0,
          },
        ],
      },
      notifications: {
        _tag: "Loaded",
        total: 1,
        items: [
          {
            id: 55,
            title: "Add rate limiting to the public API",
            subjectType: "Pull",
            repo: "acme/api",
            url: "https://forgejo.example/acme/api/pulls/42",
            updatedAt: "2026-11-06T17:00:00Z",
          },
        ],
      },
    })

    const searches = forgejo.requests.filter((r) => r.path === "/api/v1/repos/issues/search")
    expect(searches.map((r) => Object.fromEntries(r.query))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ review_requested: "true", type: "pulls", state: "open" }),
        expect.objectContaining({ assigned: "true", state: "open" }),
        expect.objectContaining({ mentioned: "true", state: "open" }),
        expect.objectContaining({ created: "true", state: "open" }),
      ]),
    )
    expect(new Set(searches.map((r) => r.authorization))).toEqual(new Set(["Bearer access-1"]))
  })
})

describe("access token refresh", () => {
  it("refreshes an expiring access token and calls Forgejo with the new one", async () => {
    const forgejo = createFakeForgejo({ expiresIn: 30 })
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/dashboard", { headers: { cookie } })

    expect(response.status).toBe(200)
    const refresh = forgejo.requests.find((r) => r.form.get("grant_type") === "refresh_token")
    expect(refresh?.form.get("refresh_token")).toBe("refresh-1")
    const apiCalls = forgejo.requests.filter((r) => r.path.startsWith("/api/v1/repos"))
    expect(apiCalls).toHaveLength(4)
    expect(new Set(apiCalls.map((r) => r.authorization))).toEqual(new Set(["Bearer access-2"]))
  })

  it("refreshes once when Forgejo rejects an unexpired access token", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)
    forgejo.revokeAccessTokens()

    const response = await call("/api/dashboard", { headers: { cookie } })

    expect(response.status).toBe(200)
    const lastSearch = forgejo.requests.findLast((r) => r.path === "/api/v1/repos/issues/search")
    expect(lastSearch?.authorization).toBe("Bearer access-2")
  })

  it("deletes the session and returns 401 when Forgejo answers invalid_grant", async () => {
    const forgejo = createFakeForgejo({
      expiresIn: 30,
      refreshFailure: { status: 400, body: JSON.stringify({ error: "invalid_grant" }) },
    })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/dashboard", { headers: { cookie } })

    expect(response.status).toBe(401)
    expect(await sessionCount()).toBe(0)
    expect((await call("/api/me", { headers: { cookie } })).status).toBe(401)
  })

  it.each([
    ["429 from a rate limiter", 429, "Too Many Requests"],
    ["401 invalid_client after a client secret rotation", 401, '{"error":"invalid_client"}'],
    ["400 unauthorized_client", 400, '{"error":"unauthorized_client"}'],
    ["400 with a body that is not JSON", 400, "<html>Bad Request</html>"],
  ])(
    "keeps the session and returns 502 when the refresh fails with %s",
    async (_, status, body) => {
      const forgejo = createFakeForgejo({ expiresIn: 30, refreshFailure: { status, body } })
      const call = tabulo(forgejo.fetch)
      const cookie = await signIn(call, forgejo)

      const response = await call("/api/dashboard", { headers: { cookie } })

      expect(response.status).toBe(502)
      expect(await sessionCount()).toBe(1)
      expect((await call("/api/me", { headers: { cookie } })).status).toBe(200)
    },
  )
})

describe("concurrent access token refresh", () => {
  it("keeps the session when another request rotated the refresh token first", async () => {
    let releaseIssued = () => {}
    const issuedHeld = new Promise<void>((resolve) => {
      releaseIssued = resolve
    })
    const forgejo = createFakeForgejo({
      expiresIn: 30,
      beforeRefreshResponse: (outcome) => (outcome === "issued" ? issuedHeld : Promise.resolve()),
    })
    const clock = createFakeClock({ parkSleeps: true })
    const call = tabulo(forgejo.fetch, { clock: clock.clock })
    const cookie = await signIn(call, forgejo)

    const requests = [
      call("/api/dashboard", { headers: { cookie } }),
      call("/api/dashboard", { headers: { cookie } }),
    ]
    // The request whose refresh was rejected has looked at the session and is waiting (or has
    // given up). Only now does the winner receive its tokens and store them.
    await Promise.race([clock.slept, ...requests])
    releaseIssued()
    await Promise.race(requests)
    clock.wake()
    const responses = await Promise.all(requests)

    expect(responses.map((r) => r.status)).toEqual([200, 200])
    expect(refreshGrants(forgejo)).toEqual(["refresh-1", "refresh-1"])
    expect(await sessionCount()).toBe(1)
    expect((await call("/api/dashboard", { headers: { cookie } })).status).toBe(200)
    expect(refreshGrants(forgejo)).toEqual(["refresh-1", "refresh-1", "refresh-2"])
  })

  it("does not continue a session that was signed out while its refresh was in flight", async () => {
    let refreshArrived = () => {}
    const arrived = new Promise<void>((resolve) => {
      refreshArrived = resolve
    })
    let releaseRefresh = () => {}
    const held = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    const forgejo = createFakeForgejo({
      expiresIn: 30,
      beforeRefreshResponse: () => {
        refreshArrived()
        return held
      },
    })
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const pending = call("/api/dashboard", { headers: { cookie } })
    await arrived
    const logout = await call("/auth/logout", {
      method: "POST",
      headers: { cookie, origin: APP_URL },
    })
    expect(logout.status).toBe(204)
    releaseRefresh()

    expect((await pending).status).toBe(401)
    expect(await sessionCount()).toBe(0)
  })
})
