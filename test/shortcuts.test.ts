import { describe, expect, it } from "vitest"
import {
  type KeyInfo,
  type PendingKey,
  resolveKey,
  SEQUENCE_TIMEOUT_MS,
  SHORTCUTS,
  shortcutKeys,
} from "../src/client/palette/shortcuts.ts"

const press = (key: string, modifiers: Partial<KeyInfo> = {}): KeyInfo => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...modifiers,
})

/** Feeds keystrokes at the given times and returns what each one resolved to. */
const typeKeys = (keys: ReadonlyArray<readonly [KeyInfo, number]>, typing = false) => {
  let pending: PendingKey = null
  return keys.map(([event, at]) => {
    const result = resolveKey(event, pending, at, typing)
    pending = result.pending
    return result.shortcut
  })
}

describe("resolveKey", () => {
  it("opens the command menu with Cmd+K or Ctrl+K, even while typing", () => {
    expect(typeKeys([[press("k", { metaKey: true }), 0]], true)).toEqual(["palette"])
    expect(typeKeys([[press("K", { ctrlKey: true }), 0]], true)).toEqual(["palette"])
    expect(typeKeys([[press("k", { ctrlKey: true, altKey: true }), 0]])).toEqual([null])
  })

  it("goes to a view with g then its letter", () => {
    expect(
      typeKeys([
        [press("g"), 0],
        [press("b"), 100],
        [press("g"), 200],
        [press("e"), 300],
      ]),
    ).toEqual([null, "go-board", null, "go-epics"])
  })

  it("forgets g after the timeout, after another key, and when the second key is wrong", () => {
    expect(
      typeKeys([
        [press("g"), 0],
        [press("d"), SEQUENCE_TIMEOUT_MS + 1],
      ]),
    ).toEqual([null, null])
    expect(
      typeKeys([
        [press("g"), 0],
        [press("x"), 100],
        [press("d"), 200],
      ]),
    ).toEqual([null, null, null])
    expect(
      typeKeys([
        [press("g"), 0],
        [press("g"), 100],
        [press("i"), 200],
      ]),
    ).toEqual([null, null, "go-insights"])
  })

  it("opens the shortcuts dialog with ?", () => {
    expect(typeKeys([[press("?"), 0]])).toEqual(["shortcuts"])
  })

  it("ignores plain keys and sequences while typing", () => {
    expect(
      typeKeys(
        [
          [press("?"), 0],
          [press("g"), 10],
          [press("d"), 20],
        ],
        true,
      ),
    ).toEqual([null, null, null])
  })

  it("does not read a modified key as a sequence", () => {
    expect(
      typeKeys([
        [press("g"), 0],
        [press("d", { metaKey: true }), 100],
      ]),
    ).toEqual([null, null])
  })
})

describe("shortcutKeys", () => {
  it("shows Cmd on a Mac and Ctrl elsewhere", () => {
    expect(shortcutKeys("palette", true)).toEqual(["⌘", "K"])
    expect(shortcutKeys("palette", false)).toEqual(["Ctrl", "K"])
  })

  it("describes every shortcut", () => {
    for (const { id } of SHORTCUTS) expect(shortcutKeys(id, false).length).toBeGreaterThan(0)
  })
})
