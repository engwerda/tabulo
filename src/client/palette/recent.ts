const KEY = "tabulo.palette.recent"
const MAX_RECENT = 8

// Remembering is a convenience: storage can be missing or refuse writes.
export const readRecent = (): ReadonlyArray<string> => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENT)
      : []
  } catch {
    return []
  }
}

export const rememberCommand = (id: string) => {
  const next = [id, ...readRecent().filter((existing) => existing !== id)].slice(0, MAX_RECENT)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
}
