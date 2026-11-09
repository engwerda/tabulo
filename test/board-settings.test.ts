import { describe, expect, it } from "vitest"
import {
  applySavedBoard,
  type BoardDraft,
  columnRows,
  describeFields,
  draftOf,
  draftProblem,
  dropColumn,
  isDirty,
  moveColumn,
  NEW_BOARD_DRAFT,
  placeColumnAsIn,
  rebaseDraft,
  type SettingsBase,
  setColumnHidden,
  toCreateRequest,
  toUpdateRequest,
  withColumnOrder,
} from "../src/client/board/board-settings.ts"
import type { Board, BoardCard, BoardColumn, SavedBoard } from "../src/shared/api.ts"

const TODO: BoardColumn = { _tag: "Todo", key: "todo", title: "Todo" }
const DONE: BoardColumn = { _tag: "Done", key: "done", title: "Done" }
const status = (title: string, id: number): BoardColumn => ({
  _tag: "Status",
  key: `Status/${title}`,
  title,
  label: { id, name: `Status/${title}`, color: "8b5cf6" },
})
const PROGRESS = status("In Progress", 1)
const REVIEW = status("Review", 2)
const BLOCKED = status("Blocked", 3)

const saved = (fields: Partial<SavedBoard> = {}): SavedBoard => ({
  id: "k3x9q2m7",
  name: "Design",
  repos: ["web", "mobile"],
  unreadableRepos: 0,
  columns: ["todo", "Status/In Progress", "Status/Review", "done"],
  hidden: [],
  version: 4,
  ...fields,
})

const base = (
  fields: Partial<SavedBoard> = {},
  allColumns: ReadonlyArray<BoardColumn> = [TODO, PROGRESS, REVIEW, DONE],
): SettingsBase => ({ board: saved(fields), allColumns })

const keys = (columns: ReadonlyArray<BoardColumn>) => columns.map((column) => column.key)

describe("the draft of a board", () => {
  it("lists every laid-out column in the board's order with the hidden ones marked", () => {
    const loaded = base({
      columns: ["Status/Gone", "todo", "Status/In Progress", "Status/Review", "done"],
      hidden: ["done", "Status/Gone"],
    })
    const draft = draftOf(loaded)
    expect(draft.order).toEqual(["todo", "Status/In Progress", "Status/Review", "done"])
    expect(draft.hidden).toEqual(["done"])
    expect(columnRows(loaded.allColumns, draft)).toEqual([
      { column: TODO, hidden: false },
      { column: PROGRESS, hidden: false },
      { column: REVIEW, hidden: false },
      { column: DONE, hidden: true },
    ])
  })

  it("moves a column to a position and leaves the others in their order", () => {
    const draft = draftOf(base())
    expect(moveColumn(draft, "done", 1).order).toEqual([
      "todo",
      "done",
      "Status/In Progress",
      "Status/Review",
    ])
    expect(moveColumn(draft, "todo", 99).order).toEqual([
      "Status/In Progress",
      "Status/Review",
      "done",
      "todo",
    ])
    expect(moveColumn(draft, "Status/Unknown", 0)).toBe(draft)
  })

  it("drops a column after the one it is over when it moves right and before it when it moves left", () => {
    const draft = draftOf(base())
    expect(dropColumn(draft, "todo", "Status/Review").order).toEqual([
      "Status/In Progress",
      "Status/Review",
      "todo",
      "done",
    ])
    expect(dropColumn(draft, "done", "Status/In Progress").order).toEqual([
      "todo",
      "done",
      "Status/In Progress",
      "Status/Review",
    ])
    expect(dropColumn(draft, "Status/Review", "Status/Review").order).toEqual(draft.order)
    expect(dropColumn(draft, "todo", "Status/Gone")).toBe(draft)
    expect(dropColumn(draft, "Status/Gone", "todo")).toBe(draft)
  })

  it("leaves a hidden column between the dragged one and its drop in its place", () => {
    const draft = {
      ...draftOf(base({}, [TODO, BLOCKED, PROGRESS, REVIEW, DONE])),
      hidden: ["Status/Blocked"],
    }
    expect(dropColumn(draft, "todo", "Status/In Progress").order).toEqual([
      "Status/Blocked",
      "Status/In Progress",
      "todo",
      "Status/Review",
      "done",
    ])
    expect(dropColumn(draft, "Status/In Progress", "todo").order).toEqual([
      "Status/In Progress",
      "todo",
      "Status/Blocked",
      "Status/Review",
      "done",
    ])
  })

  it("leaves a hidden column beside the column dropped on in its place", () => {
    const hiddenAfter = {
      ...draftOf(base({}, [TODO, PROGRESS, BLOCKED, REVIEW, DONE])),
      hidden: ["Status/Blocked"],
    }
    expect(dropColumn(hiddenAfter, "todo", "Status/In Progress").order).toEqual([
      "Status/In Progress",
      "todo",
      "Status/Blocked",
      "Status/Review",
      "done",
    ])
    const hiddenBefore = {
      ...draftOf(base({}, [TODO, BLOCKED, PROGRESS, REVIEW, DONE])),
      hidden: ["Status/Blocked"],
    }
    expect(dropColumn(hiddenBefore, "Status/Review", "Status/In Progress").order).toEqual([
      "todo",
      "Status/Blocked",
      "Status/Review",
      "Status/In Progress",
      "done",
    ])
  })

  it("puts back only the moved column and keeps a later change to the others", () => {
    const before = ["todo", "Status/In Progress", "Status/Review", "done"]
    const moved = {
      ...draftOf(base()),
      order: ["Status/In Progress", "Status/Review", "todo", "done"],
    }
    expect(placeColumnAsIn(moved, "todo", before).order).toEqual(before)
    const changedSince = {
      ...moved,
      order: ["Status/Review", "Status/In Progress", "todo", "done"],
    }
    expect(placeColumnAsIn(changedSince, "todo", before).order).toEqual([
      "Status/Review",
      "todo",
      "Status/In Progress",
      "done",
    ])
  })

  it("places a column the same way whether or not it is already there", () => {
    const intended = ["Status/In Progress", "todo", "Status/Review", "done"]
    const loaded = draftOf(base())
    const once = placeColumnAsIn(loaded, "todo", intended)
    expect(once.order).toEqual(intended)
    expect(placeColumnAsIn(once, "todo", intended).order).toEqual(intended)
  })

  it("puts a column back last when every column that followed it is gone", () => {
    const before = ["todo", "Status/In Progress", "Status/Gone"]
    const moved = { ...draftOf(base()), order: ["Status/In Progress", "todo", "done"] }
    expect(placeColumnAsIn(moved, "Status/In Progress", before).order).toEqual([
      "todo",
      "done",
      "Status/In Progress",
    ])
    expect(placeColumnAsIn(moved, "Status/Gone", before)).toBe(moved)
  })

  it("hides and shows a column", () => {
    const hidden = setColumnHidden(draftOf(base()), "done", true)
    expect(hidden.hidden).toEqual(["done"])
    expect(setColumnHidden(hidden, "done", true).hidden).toEqual(["done"])
    expect(setColumnHidden(hidden, "done", false).hidden).toEqual([])
  })
})

describe("saving a draft", () => {
  it("sends the trimmed name, the repositories, and the version it was loaded at", () => {
    const loaded = base()
    const request = toUpdateRequest("acme", loaded, {
      ...draftOf(loaded),
      name: "  Product  ",
      repos: ["web"],
    })
    expect(request).toEqual({
      org: "acme",
      board: "k3x9q2m7",
      version: 4,
      name: "Product",
      repos: ["web"],
      columns: ["todo", "Status/In Progress", "Status/Review", "done"],
      hidden: [],
      dropUnreadable: false,
    })
    expect(toCreateRequest("acme", { ...NEW_BOARD_DRAFT, name: " Ops ", repos: ["api"] })).toEqual({
      org: "acme",
      name: "Ops",
      repos: ["api"],
    })
  })

  it("keeps stored keys without a column after the reordered columns", () => {
    const loaded = base({
      columns: ["todo", "Status/Gone", "Status/In Progress", "Status/Review", "done"],
      hidden: ["Status/Gone"],
    })
    const draft = setColumnHidden(moveColumn(draftOf(loaded), "Status/Review", 0), "todo", true)
    const request = toUpdateRequest("acme", loaded, draft)
    expect(request.columns).toEqual([
      "Status/Review",
      "todo",
      "Status/In Progress",
      "done",
      "Status/Gone",
    ])
    expect(request.hidden).toEqual(["todo", "Status/Gone"])
  })

  it("sends the stored columns as they are when the user left them alone", () => {
    const loaded = base({ id: "default", columns: [], version: 0 })
    const renamed = { ...draftOf(loaded), name: "Everything" }
    expect(toUpdateRequest("acme", loaded, renamed)).toMatchObject({ columns: [], hidden: [] })
    const movedBack = moveColumn(moveColumn(renamed, "done", 0), "done", 3)
    expect(toUpdateRequest("acme", loaded, movedBack).columns).toEqual([])
    const hidden = setColumnHidden(renamed, "done", true)
    expect(toUpdateRequest("acme", loaded, hidden)).toMatchObject({ columns: [], hidden: ["done"] })
  })

  it("asks to drop the repositories the user cannot read only when the draft says so", () => {
    const loaded = base({ unreadableRepos: 2 })
    const draft = { ...draftOf(loaded), dropUnreadable: true }
    expect(toUpdateRequest("acme", loaded, draft).dropUnreadable).toBe(true)
  })
})

describe("whether a draft can be saved", () => {
  const draft = (fields: Partial<BoardDraft>): BoardDraft => ({
    ...NEW_BOARD_DRAFT,
    name: "Design",
    repos: ["web"],
    ...fields,
  })
  const repos = (count: number) => Array.from({ length: count }, (_, index) => `repo-${index}`)

  it("needs a name and a repository", () => {
    expect(draftProblem(draft({ name: "   " }))).toEqual({
      field: "name",
      message: "Name the board",
    })
    expect(draftProblem(draft({ repos: [] }))).toEqual({
      field: "repos",
      message: "Choose a repository",
    })
    expect(draftProblem(draft({ name: "x".repeat(61) }))?.field).toBe("name")
    expect(draftProblem(draft({}))).toBeNull()
  })

  it("allows 20 repositories, counting the ones the user cannot read unless they go", () => {
    expect(draftProblem(draft({ repos: repos(20) }))).toBeNull()
    expect(draftProblem(draft({ repos: repos(21) }))).toEqual({
      field: "repos",
      message: "Choose at most 20 repositories",
    })
    expect(draftProblem(draft({ repos: repos(18) }), 3)).toEqual({
      field: "repos",
      message: "Choose at most 17 repositories, or remove the ones you cannot read",
    })
    expect(draftProblem(draft({ repos: repos(18), dropUnreadable: true }), 3)).toBeNull()
  })

  it("is unchanged by whitespace around the name or the order the repositories were chosen in", () => {
    const loaded = base()
    expect(isDirty(loaded, { ...draftOf(loaded), name: " Design " })).toBe(false)
    expect(isDirty(loaded, { ...draftOf(loaded), repos: ["Mobile", "web"] })).toBe(false)
    expect(isDirty(loaded, { ...draftOf(loaded), repos: ["web"] })).toBe(true)
    expect(isDirty(loaded, moveColumn(draftOf(loaded), "done", 0))).toBe(true)
    expect(isDirty(loaded, { ...draftOf(loaded), dropUnreadable: true })).toBe(true)
  })
})

describe("rebaseDraft after someone else saved first", () => {
  it("keeps the fields the user changed and takes theirs for the rest", () => {
    const loaded = base()
    const mine = moveColumn(draftOf(loaded), "done", 0)
    const theirs = base({ name: "Product", hidden: ["Status/Review"], version: 5 })
    const { draft, theirChanges } = rebaseDraft(loaded, theirs, mine)
    expect(draft).toEqual({
      name: "Product",
      repos: ["web", "mobile"],
      order: ["done", "todo", "Status/In Progress", "Status/Review"],
      hidden: ["Status/Review"],
      dropUnreadable: false,
    })
    expect(theirChanges).toEqual(["name", "hidden"])
    expect(toUpdateRequest("acme", theirs, draft).version).toBe(5)
  })

  it("keeps the user's value of a field both changed and names it as theirs too", () => {
    const loaded = base()
    const mine = { ...draftOf(loaded), name: "Mine", repos: ["web"] }
    const theirs = base({ name: "Theirs", repos: ["web", "mobile", "api"], version: 5 })
    const { draft, theirChanges } = rebaseDraft(loaded, theirs, mine)
    expect(draft.name).toBe("Mine")
    expect(draft.repos).toEqual(["web"])
    expect(theirChanges).toEqual(["name", "repos"])
  })

  it("names no change when theirs is what the user loaded", () => {
    const loaded = base()
    const mine = { ...draftOf(loaded), name: "Mine" }
    const { draft, theirChanges } = rebaseDraft(loaded, base({ version: 5 }), mine)
    expect(draft).toEqual(mine)
    expect(theirChanges).toEqual([])
  })

  it("adds a column that appeared since to the user's order, after the column it follows", () => {
    const loaded = base()
    const mine = moveColumn(draftOf(loaded), "done", 0)
    const theirs = base({ version: 5 }, [TODO, BLOCKED, PROGRESS, REVIEW, DONE])
    expect(rebaseDraft(loaded, theirs, mine).draft.order).toEqual([
      "done",
      "todo",
      "Status/Blocked",
      "Status/In Progress",
      "Status/Review",
    ])
  })

  it("drops a column that is gone from the user's order and hidden columns", () => {
    const loaded = base()
    const mine = setColumnHidden(moveColumn(draftOf(loaded), "done", 0), "Status/Review", true)
    const theirs = base({ version: 5 }, [TODO, PROGRESS, DONE])
    const { draft } = rebaseDraft(loaded, theirs, mine)
    expect(draft.order).toEqual(["done", "todo", "Status/In Progress"])
    expect(draft.hidden).toEqual([])
  })

  it("names the repositories as theirs when only the ones the user cannot read changed", () => {
    const loaded = base({ unreadableRepos: 1 })
    const mine = { ...draftOf(loaded), dropUnreadable: true }
    const { draft, theirChanges } = rebaseDraft(loaded, base({ unreadableRepos: 0 }), mine)
    expect(theirChanges).toEqual(["repos"])
    expect(draft.dropUnreadable).toBe(false)
    const stillThere = rebaseDraft(loaded, base({ unreadableRepos: 2 }), mine)
    expect(stillThere.draft.dropUnreadable).toBe(true)
  })

  it("saves a rebased draft against their stored board and version", () => {
    const loaded = base()
    const theirs = base(
      {
        columns: ["Status/Gone", "done", "todo", "Status/In Progress", "Status/Review"],
        hidden: ["Status/Review", "Status/Gone"],
        version: 7,
      },
      [DONE, TODO, PROGRESS, REVIEW],
    )
    const renamed = rebaseDraft(loaded, theirs, { ...draftOf(loaded), name: "Mine" }).draft
    expect(toUpdateRequest("acme", theirs, renamed)).toEqual({
      org: "acme",
      board: "k3x9q2m7",
      version: 7,
      name: "Mine",
      repos: ["web", "mobile"],
      columns: ["Status/Gone", "done", "todo", "Status/In Progress", "Status/Review"],
      hidden: ["Status/Review", "Status/Gone"],
      dropUnreadable: false,
    })
    const reordered = rebaseDraft(
      loaded,
      theirs,
      moveColumn(draftOf(loaded), "Status/Review", 0),
    ).draft
    expect(toUpdateRequest("acme", theirs, reordered)).toMatchObject({
      version: 7,
      columns: ["Status/Review", "todo", "Status/In Progress", "done", "Status/Gone"],
      hidden: ["Status/Review", "Status/Gone"],
    })
  })

  it("names the changed fields in words", () => {
    expect(describeFields(["name"])).toBe("the name")
    expect(describeFields(["name", "hidden"])).toBe("the name and the hidden columns")
    expect(describeFields(["name", "repos", "columns"])).toBe(
      "the name, the repositories and the column order",
    )
  })
})

describe("applySavedBoard", () => {
  const card = (key: string, column: string, repo = "web"): BoardCard => ({
    key: `acme/${repo}#${key}`,
    repo,
    number: Number(key),
    title: `Issue ${key}`,
    url: "",
    state: column === "done" ? "closed" : "open",
    labels: [],
    assignees: [],
    milestone: null,
    author: { login: "ada", avatarUrl: "" },
    comments: 0,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    closedAt: null,
    column,
    rank: "a0",
    readOnlyReason: null,
  })
  const loaded: Board = {
    org: "acme",
    board: saved(),
    viewerCanArrange: true,
    columns: [TODO, PROGRESS, REVIEW, DONE],
    allColumns: [TODO, PROGRESS, REVIEW, DONE],
    cards: [card("1", "todo"), card("2", "done"), card("3", "Status/Review", "mobile")],
    failedRepos: [{ repo: "mobile", message: "Forgejo answered 500" }],
  }

  it("hides a column and its cards and orders the columns at once", () => {
    const next = saved({ hidden: ["done"], version: 5 })
    const shown = applySavedBoard(loaded, next, [
      "done",
      "todo",
      "Status/In Progress",
      "Status/Review",
    ])
    expect(shown.board).toBe(next)
    expect(keys(shown.allColumns)).toEqual(["done", "todo", "Status/In Progress", "Status/Review"])
    expect(keys(shown.columns)).toEqual(["todo", "Status/In Progress", "Status/Review"])
    expect(shown.cards.map((each) => each.number)).toEqual([1, 3])
  })

  it("drops the cards and failures of removed repositories and keeps the order by default", () => {
    const shown = applySavedBoard(loaded, saved({ repos: ["web"], version: 5 }))
    expect(keys(shown.columns)).toEqual(keys(loaded.columns))
    expect(shown.cards.map((each) => each.number)).toEqual([1, 2])
    expect(shown.failedRepos).toEqual([])
  })

  it("keeps a column that appeared after the order was arranged, after the column it follows", () => {
    const grown = { ...loaded, columns: [TODO, BLOCKED, PROGRESS, REVIEW, DONE] }
    const now = { ...grown, allColumns: grown.columns }
    const shown = applySavedBoard(now, saved({ version: 5 }), [
      "done",
      "todo",
      "Status/In Progress",
      "Status/Review",
    ])
    const expected = ["done", "todo", "Status/Blocked", "Status/In Progress", "Status/Review"]
    expect(keys(shown.allColumns)).toEqual(expected)
    expect(keys(shown.columns)).toEqual(expected)
  })

  it("shows a column that was hidden, whose cards come with the next read", () => {
    const hiding = {
      ...loaded,
      columns: [TODO, PROGRESS, REVIEW],
      board: saved({ hidden: ["done"] }),
    }
    const shown = applySavedBoard(hiding, saved({ hidden: [], version: 5 }))
    expect(keys(shown.columns)).toEqual(["todo", "Status/In Progress", "Status/Review", "done"])
  })
})

describe("withColumnOrder", () => {
  const board: Board = {
    org: "acme",
    board: saved({ hidden: ["Status/Review"] }),
    viewerCanArrange: true,
    columns: [TODO, PROGRESS, DONE],
    allColumns: [TODO, PROGRESS, REVIEW, DONE],
    cards: [],
    failedRepos: [],
  }

  it("orders every column and keeps showing the same ones", () => {
    const arranged = withColumnOrder(board, ["done", "Status/Review", "todo", "Status/In Progress"])
    expect(keys(arranged.allColumns)).toEqual([
      "done",
      "Status/Review",
      "todo",
      "Status/In Progress",
    ])
    expect(keys(arranged.columns)).toEqual(["done", "todo", "Status/In Progress"])
    expect(arranged.board).toBe(board.board)
  })

  it("keeps a column that appeared since after the column it follows and drops a gone one", () => {
    const grown = {
      ...board,
      columns: [TODO, BLOCKED, PROGRESS, DONE],
      allColumns: [TODO, BLOCKED, PROGRESS, REVIEW, DONE],
    }
    const arranged = withColumnOrder(grown, [
      "Status/Gone",
      "done",
      "todo",
      "Status/In Progress",
      "Status/Review",
    ])
    expect(keys(arranged.allColumns)).toEqual([
      "done",
      "todo",
      "Status/Blocked",
      "Status/In Progress",
      "Status/Review",
    ])
    expect(keys(arranged.columns)).toEqual(["done", "todo", "Status/Blocked", "Status/In Progress"])
  })
})
