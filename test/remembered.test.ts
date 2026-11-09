import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  forgetBoard,
  rememberBoard,
  rememberedBoard,
  rememberedScope,
} from "../src/client/scope/remembered.ts"
import type { KeyValueStorage } from "../src/client/stored-data.ts"

const memoryStorage = () => {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
    entries: () => Object.fromEntries(items),
  }
}

const browser = globalThis as { localStorage?: KeyValueStorage }
let storage = memoryStorage()
beforeEach(() => {
  storage = memoryStorage()
  browser.localStorage = storage
})
afterEach(() => {
  delete browser.localStorage
})

describe("the remembered board", () => {
  it("opens the board last used in an organization, whatever case its name is in", () => {
    rememberBoard("Acme", "k3x9q2m7")
    expect(rememberedBoard("acme")).toBe("k3x9q2m7")
    expect(rememberedBoard("ACME")).toBe("k3x9q2m7")
    expect(rememberedScope("acme").board).toBe("k3x9q2m7")
    expect(rememberedBoard("globex")).toBe("default")
  })

  it("never stores the default board, so its links follow the default board", () => {
    rememberBoard("acme", "k3x9q2m7")
    rememberBoard("acme", "default")
    expect(storage.entries()).toEqual({ "tabulo.lastOrg": "acme" })
    expect(rememberedBoard("acme")).toBe("default")
  })

  it("forgets a board and says whether it was the one the links opened", () => {
    rememberBoard("acme", "k3x9q2m7")
    expect(forgetBoard("acme", "p2r8w4n1")).toBe(false)
    expect(rememberedBoard("acme")).toBe("k3x9q2m7")
    expect(forgetBoard("ACME", "k3x9q2m7")).toBe(true)
    expect(rememberedBoard("acme")).toBe("default")
    expect(forgetBoard("acme", "k3x9q2m7")).toBe(false)
  })

  it("never counts the default board as the one that is gone", () => {
    expect(forgetBoard("acme", "default")).toBe(false)
    rememberBoard("acme", "default")
    expect(forgetBoard("acme", "default")).toBe(false)
  })
})
