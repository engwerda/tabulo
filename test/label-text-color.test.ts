import { describe, expect, it } from "vitest"
import { textColorOn } from "../src/client/format.ts"

const WHITE = "#ffffff"
const BLACK = "#000000"

// Contrast ratios from the WCAG 2 formula, (L1 + 0.05) / (L2 + 0.05). Label text is small, so
// it needs 4.5:1 (WCAG AA).
describe("label text color", () => {
  it.each([
    ["#d73a4a", WHITE, "white 4.57:1, black 4.59:1"],
    ["#ee0701", WHITE, "white 4.50:1, black 4.67:1"],
    ["#0e8a16", WHITE, "white 4.50:1, black 4.67:1"],
    ["#000000", WHITE, "white 21:1"],
    ["#ff0000", BLACK, "white 4.00:1 fails AA, black 5.25:1"],
    ["#fbca04", BLACK, "white 1.55:1, black 13.55:1"],
    ["#ffffff", BLACK, "black 21:1"],
  ])("on %s it uses %s text (%s)", (background, text) => {
    expect(textColorOn(background)).toBe(text)
  })
})
