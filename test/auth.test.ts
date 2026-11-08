import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo, FORGEJO_URL } from "./fake-forgejo.ts"
import {
  APP_URL,
  callback,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  setCookies,
  signIn,
  startLogin,
  tabulo,
} from "./harness.ts"

describe("GET /auth/login", () => {
  it("redirects to the Forgejo authorize endpoint with state and an S256 PKCE challenge", async () => {
    const response = await tabulo(createFakeForgejo().fetch)("/auth/login")

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get("location") ?? "")
    expect(`${location.origin}${location.pathname}`).toBe(`${FORGEJO_URL}/login/oauth/authorize`)
    expect(location.searchParams.get("client_id")).toBe("test-client-id")
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP_URL}/auth/callback`)
    expect(location.searchParams.get("response_type")).toBe("code")
    expect(location.searchParams.get("code_challenge_method")).toBe("S256")
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(location.searchParams.get("scope")).toBe(
      "read:user read:organization read:repository write:issue read:notification read:misc",
    )
  })
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
  ])
})

const sessionCount = async () =>
  (await env.DB.prepare("SELECT count(*) AS n FROM sessions").first<{ n: number }>())?.n

describe("GET /auth/callback", () => {
  it("rejects an unknown state with 400 and creates no session", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const login = await startLogin(call)
    const code = forgejo.approve(login.codeChallenge)

    const response = await callback(call, { code, state: "forged-state" }, "forged-state")

    expect(response.status).toBe(400)
    expect(setCookies(response).has(SESSION_COOKIE)).toBe(false)
    expect(await sessionCount()).toBe(0)
  })

  it("rejects a reused state with 400 and creates no second session", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const login = await startLogin(call)
    const first = await callback(
      call,
      { code: forgejo.approve(login.codeChallenge), state: login.state },
      login.browserState,
    )
    expect(first.status).toBe(302)

    const replay = await callback(
      call,
      { code: forgejo.approve(login.codeChallenge), state: login.state },
      login.browserState,
    )

    expect(replay.status).toBe(400)
    expect(setCookies(replay).has(SESSION_COOKIE)).toBe(false)
    expect(await sessionCount()).toBe(1)
  })

  it("accepts a state for 10 minutes", async () => {
    const forgejo = createFakeForgejo()
    const clock = createFakeClock()
    const call = tabulo(forgejo.fetch, { clock: clock.clock })
    const fresh = await startLogin(call)
    const stale = await startLogin(call)
    clock.advance(10 * 60_000 - 1)

    const accepted = await callback(
      call,
      { code: forgejo.approve(fresh.codeChallenge), state: fresh.state },
      fresh.browserState,
    )
    clock.advance(1)
    const rejected = await callback(
      call,
      { code: forgejo.approve(stale.codeChallenge), state: stale.state },
      stale.browserState,
    )

    expect(accepted.status).toBe(302)
    expect(rejected.status).toBe(400)
    expect(setCookies(rejected).has(SESSION_COOKIE)).toBe(false)
    expect(await sessionCount()).toBe(1)
  })

  it("leaves the state usable when a callback comes from a browser without it", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const login = await startLogin(call)
    const code = forgejo.approve(login.codeChallenge)

    const foreign = await callback(call, { code: "other", state: login.state }, "")
    const own = await callback(call, { code, state: login.state }, login.browserState)

    expect(foreign.status).toBe(400)
    expect(own.status).toBe(302)
    expect(setCookies(own).has(SESSION_COOKIE)).toBe(true)
  })

  it("rejects a state issued to another browser", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const attacker = await startLogin(call)
    const victim = await startLogin(call)

    const response = await callback(
      call,
      { code: forgejo.approve(attacker.codeChallenge), state: attacker.state },
      victim.browserState,
    )

    expect(response.status).toBe(400)
    expect(await sessionCount()).toBe(0)
  })

  it("creates a session with a hardened cookie and stores no plaintext token", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const login = await startLogin(call)

    const response = await callback(
      call,
      { code: forgejo.approve(login.codeChallenge), state: login.state },
      login.browserState,
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("/")
    const cookie = setCookies(response).get(SESSION_COOKIE)
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining(["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]),
    )

    const tokenRequest = forgejo.requests.find((r) => r.path === "/login/oauth/access_token")
    expect(tokenRequest?.form.get("grant_type")).toBe("authorization_code")
    const rows = await env.DB.prepare("SELECT * FROM sessions").all()
    expect(rows.results).toHaveLength(1)
    const stored = JSON.stringify(rows.results)
    expect(stored).not.toContain("access-1")
    expect(stored).not.toContain("refresh-1")
    expect(stored).not.toContain(cookie?.value)
    expect(rows.results[0]).toMatchObject({
      forgejo_user_id: 7,
      login: "ada",
      name: "Ada Lovelace",
    })

    const me = await call("/api/me", { headers: { cookie: `${SESSION_COOKIE}=${cookie?.value}` } })
    expect(await me.json()).toEqual({
      login: "ada",
      name: "Ada Lovelace",
      avatarUrl: "https://forgejo.example/avatars/ada",
    })
  })
})

describe("signing in again", () => {
  it("deletes the session the browser already had", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const previous = await signIn(call, forgejo)
    const login = await startLogin(call)

    const response = await call(
      `/auth/callback?${new URLSearchParams({
        code: forgejo.approve(login.codeChallenge),
        state: login.state,
      })}`,
      { headers: { cookie: `${OAUTH_STATE_COOKIE}=${login.browserState}; ${previous}` } },
    )

    expect(response.status).toBe(302)
    const next = `${SESSION_COOKIE}=${setCookies(response).get(SESSION_COOKIE)?.value}`
    expect(next).not.toBe(previous)
    expect(await sessionCount()).toBe(1)
    expect((await call("/api/me", { headers: { cookie: previous } })).status).toBe(401)
    expect((await call("/api/me", { headers: { cookie: next } })).status).toBe(200)
  })
})

describe("POST /auth/logout", () => {
  it("refuses a foreign Origin with 403 and keeps the session", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const response = await call("/auth/logout", {
      method: "POST",
      headers: { cookie, origin: "https://attacker.example" },
    })

    expect(response.status).toBe(403)
    expect((await call("/api/me", { headers: { cookie } })).status).toBe(200)
  })

  // A form in rendered Markdown would post from Tabulo's own origin; forms cannot send JSON.
  it.each(["application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "text/plain"])(
    "refuses a %s body from Tabulo's own Origin and keeps the session",
    async (type) => {
      const forgejo = createFakeForgejo()
      const call = tabulo(forgejo.fetch)
      const cookie = await signIn(call, forgejo)

      const response = await call("/auth/logout", {
        method: "POST",
        headers: { cookie, origin: APP_URL, "content-type": type },
        body: "",
      })

      expect(response.status).toBe(415)
      expect((await call("/api/me", { headers: { cookie } })).status).toBe(200)
    },
  )

  it("refuses a request without an Origin header", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const response = await call("/auth/logout", { method: "POST", headers: { cookie } })

    expect(response.status).toBe(403)
  })

  it("deletes the session when the Origin is Tabulo's own", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)

    const response = await call("/auth/logout", {
      method: "POST",
      headers: { cookie, origin: APP_URL },
    })

    expect(response.status).toBe(204)
    expect(setCookies(response).get(SESSION_COOKIE)?.attributes).toContain("Max-Age=0")
    expect((await call("/api/me", { headers: { cookie } })).status).toBe(401)
    expect(await sessionCount()).toBe(0)
  })
})

describe("session lifetime", () => {
  it("ends a session 30 days after sign-in and deletes its row", async () => {
    const forgejo = createFakeForgejo()
    const clock = createFakeClock()
    const call = tabulo(forgejo.fetch, { clock: clock.clock })
    const cookie = await signIn(call, forgejo)

    clock.advance(30 * 24 * 60 * 60_000 - 1)
    expect((await call("/api/me", { headers: { cookie } })).status).toBe(200)
    clock.advance(1)
    expect((await call("/api/me", { headers: { cookie } })).status).toBe(401)
    expect(await sessionCount()).toBe(0)
  })
})

describe("stored token encryption", () => {
  const sessionRows = async () =>
    (
      await env.DB.prepare(
        "SELECT id_hash, access_token_enc, refresh_token_enc FROM sessions",
      ).all<{ id_hash: string; access_token_enc: string; refresh_token_enc: string }>()
    ).results

  it("ends both sessions when their encrypted access tokens are swapped", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const first = await signIn(call, forgejo)
    const second = await signIn(call, forgejo)
    const [a, b] = await sessionRows()
    if (a === undefined || b === undefined) throw new Error("expected two sessions")
    await env.DB.batch([
      env.DB.prepare("UPDATE sessions SET access_token_enc = ? WHERE id_hash = ?").bind(
        b.access_token_enc,
        a.id_hash,
      ),
      env.DB.prepare("UPDATE sessions SET access_token_enc = ? WHERE id_hash = ?").bind(
        a.access_token_enc,
        b.id_hash,
      ),
    ])

    expect((await call("/api/me", { headers: { cookie: first } })).status).toBe(401)
    expect((await call("/api/me", { headers: { cookie: second } })).status).toBe(401)
    expect(await sessionCount()).toBe(0)
  })

  it("ends the session when one byte of its encrypted refresh token changes", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)
    const [row] = await sessionRows()
    if (row === undefined) throw new Error("expected a session")
    const bytes = Uint8Array.from(atob(row.refresh_token_enc), (char) => char.charCodeAt(0))
    // Past the 12-byte IV, inside the ciphertext.
    bytes[12] = (bytes[12] ?? 0) ^ 0x01
    await env.DB.prepare("UPDATE sessions SET refresh_token_enc = ? WHERE id_hash = ?")
      .bind(btoa(String.fromCharCode(...bytes)), row.id_hash)
      .run()

    expect((await call("/api/me", { headers: { cookie } })).status).toBe(401)
    expect(await sessionCount()).toBe(0)
  })
})

describe("state-changing requests", () => {
  it("refuses a JSON-shaped text/plain body that a form could post as a comment", async () => {
    const forgejo = createFakeForgejo()
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)
    const before = forgejo.requests.length

    const response = await call("/api/board/comment", {
      method: "POST",
      headers: { cookie, origin: APP_URL, "content-type": "text/plain" },
      body: JSON.stringify({ org: "acme", repo: "api", number: 1, body: "spam" }),
    })

    expect(response.status).toBe(415)
    expect(forgejo.requests.length).toBe(before)
  })
})
