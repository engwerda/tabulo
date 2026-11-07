import { describe, expect, it } from "vitest"
import {
  type BoardFilters,
  filterChoices,
  matchesFilters,
  readFilters,
} from "../src/client/board/board-view.ts"
import type { BoardCard } from "../src/shared/api.ts"

const person = (login: string) => ({ login, avatarUrl: `https://forgejo.example/avatars/${login}` })

const card = (number: number, fields: Partial<BoardCard> = {}): BoardCard => ({
  key: `acme/api#${number}`,
  repo: "api",
  number,
  title: `Issue ${number}`,
  url: `https://forgejo.example/acme/api/issues/${number}`,
  state: "open",
  labels: [],
  assignees: [],
  milestone: null,
  author: person("ada"),
  comments: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  closedAt: null,
  column: "todo",
  rank: "a0",
  readOnlyReason: null,
  ...fields,
})

const filters = (query: string): BoardFilters => readFilters(new URLSearchParams(query))

const mine = card(1, { assignees: [person("ada"), person("grace")] })
const graces = card(2, { assignees: [person("grace")], milestone: "v1.4" })
const nobodys = card(3, { title: "Fix the #12 regression", milestone: "v1.5" })
const cards = [mine, graces, nobodys]

const shown = (query: string, viewer = "ada") =>
  cards
    .filter((candidate) => matchesFilters(candidate, filters(query), viewer))
    .map((c) => c.number)

describe("board filters", () => {
  it("reads @me as the viewer, so a shared address shows each person their own cards", () => {
    expect(shown("assignee=@me", "ada")).toEqual([1])
    expect(shown("assignee=@me", "grace")).toEqual([1, 2])
  })

  it("reads @none as cards without an assignee, a milestone, or a label", () => {
    expect(shown("assignee=@none")).toEqual([3])
    expect(shown("milestone=@none")).toEqual([1])
    expect(shown("label=@none")).toEqual([1, 2, 3])
  })

  it("still matches a login and a milestone title by name", () => {
    expect(shown("assignee=grace")).toEqual([1, 2])
    expect(shown("milestone=v1.4")).toEqual([2])
  })

  it("reads #2 as exactly issue 2, while plain words search titles and numbers", () => {
    expect(shown("q=%232")).toEqual([2])
    expect(shown("q=2")).toEqual([2, 3])
    expect(shown("q=api%233")).toEqual([3])
    expect(shown("q=REGRESSION")).toEqual([3])
  })

  it("offers every assignee with an avatar and every label with its color", () => {
    const choices = filterChoices([
      card(4, {
        assignees: [person("grace")],
        labels: [{ id: 1, name: "Kind/Bug", color: "#d73a4a" }],
      }),
      mine,
    ])
    expect(choices.assignees).toEqual([person("ada"), person("grace")])
    expect(choices.labels).toEqual([{ name: "Kind/Bug", color: "#d73a4a" }])
  })
})
