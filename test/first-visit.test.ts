import { describe, expect, it } from "vitest"
import { firstVisitChoice } from "../src/client/scope/first-visit.ts"
import { MAX_REPOS } from "../src/shared/api.ts"

const repo = (name: string, archived = false) => ({ name, archived })

describe("firstVisitChoice", () => {
  it("chooses the remembered repositories without waiting for the organization's", () => {
    expect(firstVisitChoice("api,web", undefined)).toBe("api,web")
  })

  it("keeps a remembered choice of none", () => {
    expect(firstVisitChoice("", [repo("api")])).toBe("")
  })

  it("waits while nothing is remembered and the repositories are unknown", () => {
    expect(firstVisitChoice(null, undefined)).toBeUndefined()
  })

  it("chooses every active repository of a small organization", () => {
    expect(firstVisitChoice(null, [repo("api"), repo("old", true), repo("web")])).toBe("api,web")
  })

  it("chooses none when the organization has too many or no active repositories", () => {
    const many = Array.from({ length: MAX_REPOS + 1 }, (_, index) => repo(`repo-${index}`))
    expect(firstVisitChoice(null, many)).toBe("")
    expect(firstVisitChoice(null, [repo("old", true)])).toBe("")
    expect(firstVisitChoice(null, [])).toBe("")
  })
})
