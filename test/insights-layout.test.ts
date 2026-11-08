import { describe, expect, it } from "vitest"
import { type Cell, packRows } from "../src/client/insights/layout.ts"

const cells = (spec: string): ReadonlyArray<Cell<string>> =>
  spec.split(" ").map((name) => ({ item: name, span: name === name.toUpperCase() ? 2 : 1 }))

const shape = (spec: string) =>
  packRows(cells(spec)).map((row) => row.cells.map((cell) => cell.item).join(" "))

describe("packRows", () => {
  it("puts a wide card beside the next narrow card and fills rows of three", () => {
    expect(shape("THROUGHPUT attention backlog merge ci WEEKDAYS age labels people goals")).toEqual(
      ["THROUGHPUT attention", "backlog merge ci", "WEEKDAYS age", "labels people goals"],
    )
  })

  it("keeps two narrow cards as a row of two rather than leave a third column empty", () => {
    expect(shape("THROUGHPUT attention backlog merge WEEKDAYS age labels people goals")).toEqual([
      "THROUGHPUT attention",
      "backlog merge",
      "WEEKDAYS age",
      "labels people goals",
    ])
  })

  it("pulls a narrow card forward rather than leave one standing alone", () => {
    expect(shape("THROUGHPUT backlog merge WEEKDAYS age labels")).toEqual([
      "THROUGHPUT backlog",
      "merge age",
      "WEEKDAYS labels",
    ])
  })

  it("lets a wide card fill its row when no narrow card is left", () => {
    expect(shape("labels THROUGHPUT")).toEqual(["labels", "THROUGHPUT"])
  })

  it("never puts more than three columns of cards in a row", () => {
    for (const row of packRows(cells("a b c d e F g h i j k L"))) {
      expect(row.cells.reduce((total, cell) => total + cell.span, 0)).toBeLessThanOrEqual(3)
    }
  })
})
