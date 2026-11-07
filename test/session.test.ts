import { describe, expect, it } from "vitest"
import { tabulo } from "./harness.ts"

const unreachableForgejo = () => Promise.reject(new Error("Forgejo must not be called"))

describe("GET /api/me", () => {
  it("returns 401 without a session cookie", async () => {
    const response = await tabulo(unreachableForgejo)("/api/me")
    expect(response.status).toBe(401)
  })
})
