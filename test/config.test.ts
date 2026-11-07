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

describe("board settings", () => {
  it.each([
    ["BOARD_DONE_DAYS is zero", { BOARD_DONE_DAYS: "0" }],
    ["BOARD_DONE_DAYS is negative", { BOARD_DONE_DAYS: "-3" }],
    ["BOARD_DONE_DAYS is a fraction", { BOARD_DONE_DAYS: "1.5" }],
    ["BOARD_DONE_DAYS is not a number", { BOARD_DONE_DAYS: "two weeks" }],
    ["BOARD_DONE_DAYS is more than a year", { BOARD_DONE_DAYS: "366" }],
    ["BOARD_COLUMNS names a label outside the status scope", { BOARD_COLUMNS: "Todo,Kind/Bug" }],
    ["BOARD_COLUMNS repeats a column", { BOARD_COLUMNS: "Todo,Status/Review,Status/Review" }],
    ["BOARD_STATUS_SCOPE does not end with a slash", { BOARD_STATUS_SCOPE: "Status" }],
  ])("refuses to serve when %s", async (_, vars) => {
    const call = tabulo(createFakeForgejo().fetch, { vars })

    const response = await call("/auth/login")

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Tabulo is misconfigured" })
  })
})
