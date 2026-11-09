import { describe, expect, it } from "vitest"
import {
  boardHref,
  boardIdFromPath,
  canonicalBoardHref,
  orgViewHref,
} from "../src/client/scope/views.ts"

describe("board addresses", () => {
  it("names the default board by the organization alone and another board by its id", () => {
    expect(boardHref("acme", "default")).toBe("/board/acme")
    expect(boardHref("acme", "K3X9Q2M7")).toBe("/board/acme/k3x9q2m7")
    expect(boardHref("Acme Corp", "k3x9q2m7", new URLSearchParams({ card: "web#12" }))).toBe(
      "/board/Acme%20Corp/k3x9q2m7?card=web%2312",
    )
    expect(boardHref("acme", "default", new URLSearchParams())).toBe("/board/acme")
  })

  it("reads the board of an address without regard to case, the default board without an id", () => {
    expect(boardIdFromPath(undefined)).toBe("default")
    expect(boardIdFromPath("")).toBe("default")
    expect(boardIdFromPath("DEFAULT")).toBe("default")
    expect(boardIdFromPath("K3X9Q2M7")).toBe("k3x9q2m7")
  })
})

describe("canonicalBoardHref", () => {
  const params = (query = "") => new URLSearchParams(query)

  it("leaves a board's own address alone", () => {
    expect(canonicalBoardHref("acme", undefined, params())).toBeNull()
    expect(canonicalBoardHref("acme", "k3x9q2m7", params("q=login&card=web%2312"))).toBeNull()
  })

  it("names the default board by the organization alone", () => {
    expect(canonicalBoardHref("acme", "default", params())).toBe("/board/acme")
    expect(canonicalBoardHref("acme", "Default", params("label=Kind%2FBug"))).toBe(
      "/board/acme?label=Kind%2FBug",
    )
  })

  it("lowercases a board id", () => {
    expect(canonicalBoardHref("acme", "K3X9Q2M7", params())).toBe("/board/acme/k3x9q2m7")
  })

  it("drops the repositories of the time before boards and keeps the other parameters", () => {
    expect(
      canonicalBoardHref("acme", undefined, params("repos=api,web&assignee=@me&card=api%2312")),
    ).toBe("/board/acme?assignee=%40me&card=api%2312")
    expect(canonicalBoardHref("acme", "K3X9Q2M7", params("repos=api&q=crash"))).toBe(
      "/board/acme/k3x9q2m7?q=crash",
    )
  })
})

describe("orgViewHref", () => {
  it("opens an organization's board, or its insights and epics with the chosen repositories", () => {
    const scope = { org: "acme", repos: ["api", "web"], board: "k3x9q2m7" }
    expect(orgViewHref("board", scope)).toBe("/board/acme/k3x9q2m7")
    expect(orgViewHref("board", { org: "acme" })).toBe("/board/acme")
    expect(orgViewHref("insights", scope)).toBe("/insights/acme?repos=api%2Cweb")
    expect(orgViewHref("epics", { org: "acme", repos: [] })).toBe("/epics/acme")
  })

  it("opens a view's organization picker without a scope", () => {
    expect(orgViewHref("board")).toBe("/board")
    expect(orgViewHref("insights")).toBe("/insights")
  })
})
