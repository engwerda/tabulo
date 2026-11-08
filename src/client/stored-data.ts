export type KeyValueStorage = {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// public/theme-init.js reads the same key before first paint.
export const THEME_KEY = "tabulo.theme"
export const RETURN_KEY = "tabulo.returnTo"
export const OWNER_KEY = "tabulo.user"
const SHARED_KEYS: ReadonlySet<string> = new Set([THEME_KEY, RETURN_KEY])

export const forgetUserData = (storage: KeyValueStorage) => {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
  for (const key of keys) {
    if (key?.startsWith("tabulo.") && !SHARED_KEYS.has(key)) storage.removeItem(key)
  }
}

export const claimStorage = (storage: KeyValueStorage, userId: number) => {
  if (storage.getItem(OWNER_KEY) === String(userId)) return
  forgetUserData(storage)
  storage.setItem(OWNER_KEY, String(userId))
}
