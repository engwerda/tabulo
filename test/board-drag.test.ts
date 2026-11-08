import { describe, expect, it } from "vitest"
import { neighboursAfterDrop, previewKeys } from "../src/client/board/board-view.ts"

describe("dragging a card between columns", () => {
  it("shows the dragged card in the column it is over, and nowhere else", () => {
    const preview = { key: "a", column: "review", index: 1 }
    expect(previewKeys(["x", "y", "z"], "review", preview)).toEqual(["x", "a", "y", "z"])
    expect(previewKeys(["a", "b"], "todo", preview)).toEqual(["b"])
    expect(previewKeys(["a", "b"], "todo", null)).toEqual(["a", "b"])
  })

  it("drops a card where the gap is when it lands on empty column space", () => {
    expect(neighboursAfterDrop(["x", "a", "y"], "a", null)).toEqual({
      afterKey: "x",
      beforeKey: "y",
    })
  })

  it("lets the card take the place of the card it is over, in either direction", () => {
    expect(neighboursAfterDrop(["a", "b", "c", "d"], "a", "c")).toEqual({
      afterKey: "c",
      beforeKey: "d",
    })
    expect(neighboursAfterDrop(["a", "b", "c", "d"], "d", "b")).toEqual({
      afterKey: "a",
      beforeKey: "b",
    })
  })

  it("puts a card that the column does not show yet at the end", () => {
    expect(neighboursAfterDrop(["x", "y"], "a", null)).toEqual({ afterKey: "y", beforeKey: null })
    expect(neighboursAfterDrop([], "a", null)).toEqual({ afterKey: null, beforeKey: null })
  })
})
