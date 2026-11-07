import { describe, expect, it } from "vitest"
import { createFakeForgejo } from "./fake-forgejo.ts"
import { tabulo } from "./harness.ts"

describe("APP_URL", () => {
  it.each([
    ["a path", "https://tabulo.example/tabulo"],
    ["a query", "https://tabulo.example/?next=1"],
    ["credentials", "https://admin:secret@tabulo.example"],
    ["a scheme other than http or https", "ftp://tabulo.example"],
    ["an opaque origin", "data:text/plain,tabulo"],
  ])("refuses to serve when APP_URL has %s", async (_, appUrl) => {
    const call = tabulo(createFakeForgejo().fetch, { vars: { APP_URL: appUrl } })

    const response = await call("/auth/login")

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Tabulo is misconfigured" })
  })

  it("accepts an origin with a trailing slash", async () => {
    const call = tabulo(createFakeForgejo().fetch, { vars: { APP_URL: "https://tabulo.example/" } })

    const response = await call("/auth/login")

    expect(response.status).toBe(302)
    const location = new URL(response.headers.get("location") ?? "")
    expect(location.searchParams.get("redirect_uri")).toBe("https://tabulo.example/auth/callback")
  })
})
