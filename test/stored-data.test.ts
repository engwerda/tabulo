import { describe, expect, it } from "vitest"
import { claimStorage, forgetUserData } from "../src/client/stored-data.ts"

const memoryStorage = (entries: Record<string, string>) => {
  const items = new Map(Object.entries(entries))
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

const adasStorage = () =>
  memoryStorage({
    "tabulo.user": "7",
    "tabulo.lastOrg": "acme",
    "tabulo.repos.acme": "api,web",
    "tabulo.board.comment.acme/api#1": "A draft",
    "tabulo.theme": "dark",
    "tabulo.returnTo": "/board/acme",
    "another-app": "kept",
  })

describe("browser storage", () => {
  it("removes another user's data when a user claims it, but keeps the theme and return address", () => {
    const storage = adasStorage()

    claimStorage(storage, 9)

    expect(storage.entries()).toEqual({
      "tabulo.user": "9",
      "tabulo.theme": "dark",
      "tabulo.returnTo": "/board/acme",
      "another-app": "kept",
    })
  })

  it("keeps a user's own data, whatever their login is now", () => {
    const storage = adasStorage()
    const before = storage.entries()

    claimStorage(storage, 7)

    expect(storage.entries()).toEqual(before)
  })

  it("treats data with no recorded owner as another user's", () => {
    const storage = memoryStorage({ "tabulo.lastOrg": "acme" })

    claimStorage(storage, 7)

    expect(storage.entries()).toEqual({ "tabulo.user": "7" })
  })

  it("forgets the user's data and whose it was on sign-out", () => {
    const storage = adasStorage()

    forgetUserData(storage)

    expect(storage.entries()).toEqual({
      "tabulo.theme": "dark",
      "tabulo.returnTo": "/board/acme",
      "another-app": "kept",
    })
  })
})
