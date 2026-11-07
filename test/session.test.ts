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
