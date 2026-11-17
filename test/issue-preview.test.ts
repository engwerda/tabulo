import { describe, expect, it } from "vitest"
import { panelIssue } from "../src/client/issue/panel-issue.ts"
import {
  closeMove,
  focusAfterPreview,
  holdPreview,
  issueRef,
  openedEntry,
  previewKeyAction,
  withPreviewParam,
} from "../src/client/issue/preview.ts"

const preview = (fullName: string, number: number, title = `Issue ${number}`) => ({
  issue: panelIssue(fullName, number, {
    kind: "issue",
    title,
    url: `https://forgejo.example/${fullName}/issues/${number}`,
    closed: false,
  }),
})

describe("withPreviewParam", () => {
  it("names the preview and keeps the other parameters", () => {
    const start = new URLSearchParams("repos=api,web&q=search")
    const next = withPreviewParam(start, "acme/api#12")

    expect(next.get("item")).toBe("acme/api#12")
    expect(next.get("repos")).toBe("api,web")
    expect(next.get("q")).toBe("search")
    expect(start.has("item")).toBe(false)
  })

  it("drops the preview for null", () => {
    expect(withPreviewParam(new URLSearchParams("item=acme%2Fapi%2312&q=x"), null).toString()).toBe(
      "q=x",
    )
  })
})

describe("closeMove", () => {
  it("goes back to the entry before when this entry records the address it was opened from", () => {
    const entry = openedEntry("?repos=api&q=search")

    expect(closeMove(entry, "?repos=api&q=search&item=acme%2Fapi%2312")).toBe("back")
    // Another preview opened from the panel replaces the address and keeps the entry's record.
    expect(closeMove(entry, "?repos=api&item=acme%2Fweb%233&q=search")).toBe("back")
  })

  it("replaces the entry for a preview that was in the address on load", () => {
    expect(closeMove(null, "?item=acme%2Fapi%2312")).toBe("replace")
  })

  it("replaces the entry when the rest of the address changed since the preview opened", () => {
    const entry = openedEntry("?repos=api")

    expect(closeMove(entry, "?repos=web&item=acme%2Fapi%2312")).toBe("replace")
  })

  it("replaces the entry when its state is another shape", () => {
    expect(closeMove("repos=api", "?repos=api&item=acme%2Fapi%2312")).toBe("replace")
    expect(closeMove({ previewOpenedFrom: 1 }, "?item=acme%2Fapi%2312")).toBe("replace")
    expect(closeMove({ card: "api#12" }, "?item=acme%2Fapi%2312")).toBe("replace")
  })
})

describe("holdPreview", () => {
  const listed = preview("acme/api", 12, "Listed")

  it("shows and holds what the page lists", () => {
    expect(holdPreview(null, listed, "acme/api#12")).toEqual({ shown: listed, held: listed })
  })

  it("keeps showing the held preview while the address names it and the page no longer lists it", () => {
    expect(holdPreview(listed, undefined, "ACME/Api#12")).toEqual({ shown: listed, held: listed })
  })

  it("shows a fresher read over the held one", () => {
    const renamed = preview("acme/api", 12, "Renamed")

    expect(holdPreview(listed, renamed, "acme/api#12").shown?.issue.title).toBe("Renamed")
  })

  it("never shows the held preview for another reference", () => {
    expect(holdPreview(listed, undefined, "acme/api#13").shown).toBeUndefined()
  })

  it("drops the hold once no preview is open, so Forward finds nothing stale", () => {
    const closed = holdPreview(listed, undefined, null)

    expect(closed).toEqual({ shown: undefined, held: null })
    expect(holdPreview(closed.held, undefined, "acme/api#12").shown).toBeUndefined()
  })
})

describe("issueRef", () => {
  it("writes the reference that rows put in the address", () => {
    expect(issueRef(preview("Acme/API", 12).issue)).toBe("Acme/API#12")
  })
})

describe("previewKeyAction", () => {
  const key = (
    name: string,
    held: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>> = {},
  ) => ({
    key: name,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    defaultPrevented: false,
    ...held,
  })

  it("closes on Escape and opens Forgejo on O", () => {
    expect(previewKeyAction(key("Escape"), false, false)).toBe("close")
    expect(previewKeyAction(key("o"), false, false)).toBe("forgejo")
    expect(previewKeyAction(key("O"), false, false)).toBe("forgejo")
  })

  it("ignores other keys and keys with a modifier", () => {
    expect(previewKeyAction(key("j"), false, false)).toBeNull()
    expect(previewKeyAction(key("o", { metaKey: true }), false, false)).toBeNull()
    expect(previewKeyAction(key("o", { ctrlKey: true }), false, false)).toBeNull()
    expect(previewKeyAction(key("Escape", { altKey: true }), false, false)).toBeNull()
  })

  it("leaves a key to whatever handled it first", () => {
    expect(previewKeyAction({ ...key("Escape"), defaultPrevented: true }, false, false)).toBeNull()
  })

  it("ignores keys typed into a field or pressed while a dialog is open", () => {
    expect(previewKeyAction(key("o"), true, false)).toBeNull()
    expect(previewKeyAction(key("Escape"), false, true)).toBeNull()
  })
})

describe("focusAfterPreview", () => {
  const page = (sections: Record<string, ReadonlyArray<string | null>>) =>
    Object.entries(sections).map(([section, refs]) => ({ section, refs }))

  it("goes back to the opener when its row still lists the issue", () => {
    const sections = page({
      assigned: ["acme/web#1", "acme/web#2"],
      mentioned: ["acme/web#2"],
    })

    expect(
      focusAfterPreview(
        sections,
        "acme/web#2",
        { section: "mentioned", index: 0 },
        "notifications",
      ),
    ).toEqual({ section: "mentioned", row: 0 })
  })

  it("finds the issue's row elsewhere when the opener's section no longer lists it", () => {
    const sections = page({ assigned: ["acme/web#1", "ACME/Web#2"], notifications: ["acme/api#3"] })

    expect(
      focusAfterPreview(sections, "acme/web#2", { section: "notifications", index: 1 }, "x"),
    ).toEqual({ section: "assigned", row: 1 })
  })

  it("takes the row now in the opener's place when no row lists the issue", () => {
    const sections = page({ notifications: ["acme/api#3", null, "acme/api#5"] })

    expect(
      focusAfterPreview(sections, "acme/web#2", { section: "notifications", index: 1 }, "x"),
    ).toEqual({ section: "notifications", row: 1 })
    expect(
      focusAfterPreview(sections, "acme/web#2", { section: "notifications", index: 3 }, "x"),
    ).toEqual({ section: "notifications", row: 2 })
  })

  it("takes the section's heading when the opener's section has no rows left", () => {
    const sections = page({ assigned: ["acme/web#1"], notifications: [] })

    expect(
      focusAfterPreview(sections, "acme/web#2", { section: "notifications", index: 0 }, "x"),
    ).toEqual({ section: "notifications", row: "heading" })
  })

  it("falls back on the first row or heading of the fallback section after a reload", () => {
    expect(
      focusAfterPreview(
        page({ assigned: ["acme/web#1"], notifications: ["acme/api#3"] }),
        "acme/web#2",
        null,
        "notifications",
      ),
    ).toEqual({ section: "notifications", row: 0 })
    expect(
      focusAfterPreview(
        page({ assigned: ["acme/web#1"], notifications: [] }),
        "acme/web#2",
        null,
        "notifications",
      ),
    ).toEqual({ section: "notifications", row: "heading" })
  })

  it("finds the issue's row after a reload while the dashboard lists it", () => {
    const sections = page({ assigned: ["acme/web#1"], notifications: ["acme/web#1"] })

    expect(focusAfterPreview(sections, "acme/web#1", null, "notifications")).toEqual({
      section: "notifications",
      row: 0,
    })
    expect(focusAfterPreview(page({ assigned: ["acme/web#1"] }), "acme/web#1", null, "x")).toEqual({
      section: "assigned",
      row: 0,
    })
  })

  it("has nowhere to go when neither the issue nor the section to fall back on is on the page", () => {
    expect(
      focusAfterPreview(page({ assigned: [] }), "acme/web#2", null, "notifications"),
    ).toBeNull()
  })

  it("finds the issue's row anywhere when the page names no section to fall back on", () => {
    const sections = page({
      "acme/api#1": ["acme/api#1"],
      "acme/api#2": ["acme/api#2", "acme/web#3"],
    })

    expect(focusAfterPreview(sections, "acme/web#3", null, null)).toEqual({
      section: "acme/api#2",
      row: 1,
    })
    expect(focusAfterPreview(sections, "acme/web#4", null, null)).toBeNull()
  })
})
