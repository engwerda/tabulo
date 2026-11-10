import { describe, expect, it } from "vitest"
import {
  announceLayout,
  type BoardActivity,
  type BoardFilters,
  type BoardHold,
  type BoardSeen,
  heldBoard,
  landHold,
  layoutChanges,
  ME,
  matchesFilters,
  NO_HOLD,
  nextHold,
  nextSeen,
} from "../src/client/board/board-view.ts"
import type { Board, BoardCard, BoardColumn } from "../src/shared/api.ts"

const TODO: BoardColumn = { _tag: "Todo", key: "todo", title: "Todo" }
const REVIEW: BoardColumn = {
  _tag: "Status",
  key: "Status/Review",
  title: "Review",
  label: { id: 2, name: "Status/Review", color: "8b5cf6" },
}
const DONE: BoardColumn = { _tag: "Done", key: "done", title: "Done" }

const card = (number: number, column: string, rank: string): BoardCard => ({
  key: `acme/api#${number}`,
  repo: "api",
  number,
  title: `Issue ${number}`,
  url: `https://forgejo.example/acme/api/issues/${number}`,
  state: column === "done" ? "closed" : "open",
  labels: [],
  assignees: [],
  milestone: null,
  author: { login: "ada", avatarUrl: "" },
  comments: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  closedAt: column === "done" ? "2026-11-08T00:00:00Z" : null,
  column,
  rank,
  readOnlyReason: null,
})

const held: Board = {
  org: "acme",
  board: {
    id: "k3x9q2m7",
    name: "Design",
    repos: ["api"],
    unreadableRepos: 0,
    columns: ["todo", "Status/Review", "done"],
    hidden: [],
    version: 4,
  },
  viewerCanArrange: true,
  columns: [TODO, REVIEW, DONE],
  allColumns: [TODO, REVIEW, DONE],
  cards: [
    card(1, "todo", "a0"),
    card(2, "todo", "a1"),
    card(3, "Status/Review", "a0"),
    card(4, "done", "a0"),
  ],
  failedRepos: [],
}

const change = (board: Board, number: number, fields: Partial<BoardCard>): Board => ({
  ...board,
  cards: board.cards.map((each) => (each.number === number ? { ...each, ...fields } : each)),
})
const find = (board: Board, number: number) => board.cards.find((each) => each.number === number)
const toReview = (board: Board, number: number) =>
  change(board, number, { column: "Status/Review", rank: "a5" })

const NO_FILTERS: BoardFilters = { assignee: [], milestone: null, label: [], text: "" }
const filtered =
  (filters: Partial<BoardFilters>) =>
  (each: BoardCard): boolean =>
    matchesFilters(each, { ...NO_FILTERS, ...filters }, "ada")
const anyCard = filtered({})
const assignedToMe = filtered({ assignee: [ME] })
const ADA = [{ login: "ada", avatarUrl: "" }]

describe("heldBoard while someone uses the board", () => {
  it("is the live board itself when the layout did not change", () => {
    const live = change(held, 1, { title: "Renamed", comments: 3 })
    expect(heldBoard(held, live, anyCard)).toBe(live)
  })

  it("applies a change to a card's content in place while the layout waits", () => {
    const labels = [{ id: 7, name: "Kind/Bug", color: "d73a4a" }]
    const live = toReview(change(held, 1, { title: "Renamed", labels, milestone: "v2" }), 3)
    expect(find(heldBoard(held, live, anyCard), 1)).toEqual({
      ...card(1, "todo", "a0"),
      title: "Renamed",
      labels,
      milestone: "v2",
    })
  })

  it("keeps a card that moved in live where it was, with live's content", () => {
    const assignees = [{ login: "grace", avatarUrl: "" }]
    const live = change(held, 2, {
      column: "done",
      rank: "a9",
      state: "closed",
      closedAt: "2026-11-09T00:00:00Z",
      title: "Shipped",
      assignees,
    })
    expect(find(heldBoard(held, live, anyCard), 2)).toEqual({
      ...card(2, "todo", "a1"),
      title: "Shipped",
      assignees,
    })
  })

  it("leaves out a card that only the live board has", () => {
    const live = { ...held, cards: [...held.cards, card(5, "todo", "Zz")] }
    const shown = heldBoard(held, live, anyCard)
    expect(shown.cards.map((each) => each.number)).toEqual([1, 2, 3, 4])
  })

  it("keeps a card that the live board no longer has", () => {
    const live = { ...held, cards: held.cards.filter((each) => each.number !== 3) }
    expect(find(heldBoard(held, live, anyCard), 3)).toEqual(card(3, "Status/Review", "a0"))
  })

  it("keeps the columns in their held order", () => {
    const live = { ...held, columns: [REVIEW, TODO, DONE], allColumns: [REVIEW, TODO, DONE] }
    const shown = heldBoard(held, live, anyCard)
    expect(shown.columns.map((column) => column.key)).toEqual(["todo", "Status/Review", "done"])
    expect(shown.allColumns.map((column) => column.key)).toEqual(["todo", "Status/Review", "done"])
  })

  it("takes the saved board, its version, and the viewer's rights from the live board", () => {
    const live: Board = {
      ...toReview(held, 1),
      board: { ...held.board, name: "Design team", version: 5 },
      viewerCanArrange: false,
      failedRepos: [{ repo: "web", message: "Forgejo answered 500" }],
    }
    const shown = heldBoard(held, live, anyCard)
    expect(shown.board).toEqual({ ...held.board, name: "Design team", version: 5 })
    expect(shown.viewerCanArrange).toBe(false)
    expect(shown.failedRepos).toEqual([{ repo: "web", message: "Forgejo answered 500" }])
  })
})

describe("heldBoard with the board's filters", () => {
  const mine = change(held, 1, { assignees: ADA })

  it("keeps all of a card's held version while another person's change takes it out of the filters", () => {
    const live = change(mine, 1, { assignees: [], title: "Renamed" })
    const shown = heldBoard(mine, live, assignedToMe)
    expect(shown).not.toBe(live)
    expect(find(shown, 1)).toBe(find(mine, 1))
    expect(shown.cards.filter(assignedToMe).map((each) => each.number)).toEqual([1])
  })

  it("keeps out a card that another person's change brings into the filters", () => {
    const live = change(mine, 2, { assignees: ADA, title: "Renamed" })
    const shown = heldBoard(mine, live, assignedToMe)
    expect(find(shown, 2)).toBe(find(mine, 2))
    expect(shown.cards.filter(assignedToMe).map((each) => each.number)).toEqual([1])
  })

  it("applies the person's own filter change at once", () => {
    const live = change(toReview(mine, 4), 2, { title: "Renamed" })
    const before = heldBoard(mine, live, anyCard)
    const after = heldBoard(before, live, assignedToMe)
    expect(after.cards.filter(assignedToMe).map((each) => each.number)).toEqual([1])
    expect(find(after, 2)?.title).toBe("Renamed")
  })

  it("applies a change to content that leaves the card in or out of the filters as it was", () => {
    const live = change(change(mine, 1, { title: "Renamed" }), 2, { milestone: "v2" })
    expect(heldBoard(mine, live, assignedToMe)).toBe(live)
  })

  it("lets a change to cards the filters hide land at once", () => {
    const live = {
      ...toReview(mine, 2),
      cards: [
        ...toReview(mine, 2).cards.filter((each) => each.number !== 3),
        card(9, "todo", "a0"),
      ],
    }
    expect(heldBoard(mine, live, assignedToMe)).toBe(live)
    const shownMove = toReview(mine, 1)
    expect(heldBoard(mine, shownMove, assignedToMe)).not.toBe(shownMove)
  })

  it("is the held board itself when it holds that board again", () => {
    const live = toReview(change(mine, 1, { assignees: [] }), 2)
    const shown = heldBoard(mine, live, assignedToMe)
    expect(heldBoard(shown, live, assignedToMe)).toBe(shown)
  })
})

describe("layoutChanges when a layout change lands", () => {
  it("counts added, removed, and moved cards", () => {
    const moved = toReview(held, 1)
    const after = {
      ...moved,
      cards: [
        ...moved.cards.filter((each) => each.number !== 3),
        card(5, "todo", "a2"),
        card(6, "done", "a1"),
      ],
    }
    expect(layoutChanges(held, after, anyCard)).toEqual({ added: 2, removed: 1, moved: 1 })
    expect(announceLayout(layoutChanges(held, after, anyCard))).toBe(
      "Board updated: 2 added, 1 moved, 1 removed",
    )
  })

  it("counts nothing, and says nothing, when only the order within a column changed", () => {
    const after = change(held, 2, { rank: "Zz" })
    expect(layoutChanges(held, after, anyCard)).toEqual({ added: 0, removed: 0, moved: 0 })
    expect(announceLayout(layoutChanges(held, after, anyCard))).toBeNull()
  })

  it("counts a card that another person's change takes out of or into the filters", () => {
    const search = filtered({ text: "issue" })
    const after = change(change(held, 1, { title: "Renamed" }), 2, { column: "Status/Review" })
    expect(layoutChanges(held, after, search)).toEqual({ added: 0, removed: 1, moved: 1 })
    expect(layoutChanges(after, held, search)).toEqual({ added: 1, removed: 0, moved: 1 })
  })

  it("leaves out the kinds of change that did not happen", () => {
    expect(announceLayout({ added: 0, removed: 2, moved: 1 })).toBe(
      "Board updated: 1 moved, 2 removed",
    )
  })
})

const USING: BoardActivity = { using: true, writing: false, reading: false }
const IDLE: BoardActivity = { using: false, writing: false, reading: false }

describe("nextHold as the board is used, written, and read", () => {
  const shownBy = (hold: BoardHold, live: Board) => hold.snapshot ?? live

  it("keeps the layout of the moment use began through reads, until use ends", () => {
    const began = nextHold(NO_HOLD, held, USING, anyCard)
    expect(began.snapshot).toBe(held)
    const read = nextHold(began, held, { ...USING, reading: true }, anyCard)
    const refetched = change(toReview(held, 1), 2, { title: "Renamed" })
    const holding = nextHold(read, refetched, USING, anyCard)
    expect(find(shownBy(holding, refetched), 1)?.column).toBe("todo")
    expect(find(shownBy(holding, refetched), 2)?.title).toBe("Renamed")
    expect(nextHold(holding, refetched, USING, anyCard)).toBe(holding)
    expect(nextHold(holding, refetched, IDLE, anyCard).snapshot).toBeNull()
  })

  it("shows the person's write, its rollback, and the read after it at once, then holds", () => {
    const began = nextHold(NO_HOLD, held, USING, anyCard)
    const optimistic = toReview(held, 2)
    const writing = nextHold(began, optimistic, { ...USING, writing: true }, anyCard)
    expect(writing.snapshot).toBe(optimistic)
    const rolledBack = change(optimistic, 2, { column: "todo", rank: "a1" })
    const ended = nextHold(writing, rolledBack, { ...USING, reading: true }, anyCard)
    expect(ended.snapshot).toBe(rolledBack)
    const reread = toReview(rolledBack, 3)
    const landed = nextHold(ended, reread, USING, anyCard)
    expect(landed.snapshot).toBe(reread)
    const later = toReview(reread, 1)
    expect(find(shownBy(nextHold(landed, later, USING, anyCard), later), 1)?.column).toBe("todo")
  })

  it("lands what waits and Refresh's read at once, then holds again", () => {
    const began = nextHold(NO_HOLD, held, USING, anyCard)
    const waiting = toReview(held, 1)
    const holding = nextHold(began, waiting, USING, anyCard)
    expect(find(shownBy(holding, waiting), 1)?.column).toBe("todo")
    const refreshing = nextHold(landHold(holding), waiting, { ...USING, reading: true }, anyCard)
    expect(refreshing).toEqual({ snapshot: waiting, following: "refresh" })
    const reread = toReview(waiting, 2)
    const landed = nextHold(refreshing, reread, USING, anyCard)
    expect(landed).toEqual({ snapshot: reread, following: false })
    const later = toReview(reread, 4)
    const after = nextHold(landed, later, USING, anyCard)
    expect(find(shownBy(after, later), 4)?.column).toBe("done")
  })

  it("lands what waits when Refresh starts no read", () => {
    const waiting = toReview(held, 1)
    const holding = nextHold(nextHold(NO_HOLD, held, USING, anyCard), waiting, USING, anyCard)
    expect(nextHold(landHold(holding), waiting, USING, anyCard)).toEqual({
      snapshot: waiting,
      following: false,
    })
  })

  it("keeps a write's following as the write's when Refresh lands it", () => {
    const writing = nextHold(NO_HOLD, held, { ...USING, writing: true }, anyCard)
    expect(landHold(writing).following).toBe("write")
  })

  it("judges a card by the content it last showed with, so the person's search finds it", () => {
    const began = nextHold(NO_HOLD, held, USING, anyCard)
    const live = change(toReview(held, 4), 1, { title: "Renamed" })
    const holding = nextHold(began, live, USING, anyCard)
    const search = filtered({ text: "renamed" })
    const searched = nextHold(holding, live, USING, search)
    expect(
      shownBy(searched, live)
        .cards.filter(search)
        .map((each) => each.title),
    ).toEqual(["Renamed"])
  })
})

type Step = { readonly hold: BoardHold; readonly seen: BoardSeen }

const opened = (board: Board | undefined, fetched = true): Step => ({
  hold: NO_HOLD,
  seen: { board, following: false, fetched, announcement: null },
})

const read = (
  { hold, seen }: Step,
  live: Board | undefined,
  activity: BoardActivity = IDLE,
  fetched = true,
): Step => {
  const next = nextHold(hold, live, activity, anyCard)
  return {
    hold: next,
    seen: nextSeen(
      seen,
      { board: next.snapshot ?? live, following: next.following, fetched },
      live,
      anyCard,
    ),
  }
}

const said = (step: Step) => step.seen.announcement?.text ?? null

describe("nextSeen as layout changes land", () => {
  it("says nothing about the person's own write or the read that follows it", () => {
    const optimistic = toReview(held, 2)
    const writing = read(opened(held), optimistic, { ...IDLE, writing: true })
    expect(said(writing)).toBeNull()
    const ended = read(writing, optimistic, { ...IDLE, reading: true })
    expect(said(ended)).toBeNull()
    const reread = { ...optimistic, cards: [...optimistic.cards, card(5, "todo", "a2")] }
    const landed = read(ended, reread)
    expect(said(landed)).toBeNull()
    const later = { ...reread, cards: [...reread.cards, card(6, "todo", "a3")] }
    expect(said(read(landed, later))).toBe("Board updated: 1 added")
  })

  it("says what Refresh lands", () => {
    const using = read(opened(held), held, USING)
    const waiting = toReview(held, 1)
    const holding = read(using, waiting, USING)
    expect(said(holding)).toBeNull()
    const refreshing = read({ ...holding, hold: landHold(holding.hold) }, waiting, {
      ...USING,
      reading: true,
    })
    expect(said(refreshing)).toBe("Board updated: 1 moved")
    const reread = { ...waiting, cards: waiting.cards.filter((each) => each.number !== 3) }
    expect(said(read(refreshing, reread, USING))).toBe("Board updated: 1 removed")
  })

  it("says what a read lands while nobody uses the board", () => {
    const live = {
      ...toReview(held, 1),
      cards: [...toReview(held, 1).cards, card(5, "todo", "a2")],
    }
    expect(said(read(opened(held), live))).toBe("Board updated: 1 added, 1 moved")
  })

  it("says nothing until the board's first read since the page opened has landed", () => {
    const fresh = toReview(held, 1)
    const arrived = read(opened(held, false), fresh, IDLE, true)
    expect(said(arrived)).toBeNull()
    expect(said(read(arrived, toReview(fresh, 2)))).toBe("Board updated: 1 moved")
  })

  it("says nothing about the first read when a hold kept it from showing until later", () => {
    const using = read(opened(held, false), held, USING, false)
    const fresh = toReview(held, 1)
    const holding = read(using, fresh, USING, true)
    expect(find(holding.hold.snapshot ?? fresh, 1)?.column).toBe("todo")
    const landed = read(holding, fresh, IDLE, true)
    expect(said(landed)).toBeNull()
    expect(said(read(landed, toReview(fresh, 2)))).toBe("Board updated: 1 moved")
  })

  it("says what a read takes out of the filters, and nothing when only the filters change", () => {
    const search = filtered({ text: "issue" })
    const seen = opened(held).seen
    const renamed = change(held, 1, { title: "Renamed" })
    const now = { board: renamed, following: false, fetched: true } as const
    expect(nextSeen(seen, now, renamed, search).announcement?.text).toBe("Board updated: 1 removed")
    expect(nextSeen(seen, { ...now, board: held }, held, search)).toBe(seen)
  })

  it("says nothing when a read changes only the order in a column or a card's content", () => {
    const reordered = change(held, 2, { rank: "Zz" })
    const ordered = read(opened(held), reordered)
    expect(said(ordered)).toBeNull()
    expect(said(read(ordered, change(reordered, 1, { title: "Renamed" })))).toBeNull()
  })
})
