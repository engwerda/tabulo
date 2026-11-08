import { describe, expect, it } from "vitest"
import { SESSION_COOKIE, setCookies, tabulo } from "./harness.ts"

const unreachableForgejo = () => Promise.reject(new Error("Forgejo must not be called"))

describe("GET /api/me", () => {
  it("returns 401 without a session cookie", async () => {
    const response = await tabulo(unreachableForgejo)("/api/me")
    expect(response.status).toBe(401)
  })

  it("returns 401 and clears the cookie when no session matches it", async () => {
    const response = await tabulo(unreachableForgejo)("/api/me", {
      headers: { cookie: `${SESSION_COOKIE}=${"A".repeat(43)}` },
    })

    expect(response.status).toBe(401)
    expect(setCookies(response).get(SESSION_COOKIE)?.attributes).toContain("Max-Age=0")
  })
})

describe("Worker response headers", () => {
  it.each([
    ["an API response", "/api/me"],
    ["a sign-in redirect", "/auth/login"],
    ["a sign-in error", "/auth/callback?code=x&state=y"],
  ])("forbid caching and MIME sniffing and require HTTPS on %s", async (_, path) => {
    const response = await tabulo(unreachableForgejo)(path)

    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000")
  })
})
