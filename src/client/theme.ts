import { useSyncExternalStore } from "react"

export const THEME_PREFERENCES = ["system", "light", "dark"] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = "light" | "dark"

// public/theme-init.js applies the same key and rule before first paint.
const STORAGE_KEY = "tabulo.theme"
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)")

const isPreference = (value: string | null): value is ThemePreference =>
  THEME_PREFERENCES.some((preference) => preference === value)

const readPreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isPreference(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

type ThemeState = { readonly preference: ThemePreference; readonly resolved: ResolvedTheme }

const resolve = (preference: ThemePreference): ThemeState => ({
  preference,
  resolved: preference === "system" ? (darkQuery.matches ? "dark" : "light") : preference,
})

let state = resolve(readPreference())
const listeners = new Set<() => void>()

const apply = (next: ThemeState) => {
  const root = document.documentElement
  root.classList.toggle("dark", next.resolved === "dark")
  root.style.colorScheme = next.resolved
  if (next.preference === state.preference && next.resolved === state.resolved) return
  state = next
  for (const listener of listeners) listener()
}

export const setThemePreference = (preference: ThemePreference) => {
  try {
    if (preference === "system") window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {}
  apply(resolve(preference))
}

/** Applies the stored theme and keeps it current with the system setting and other tabs. */
export const startTheme = () => {
  apply(resolve(readPreference()))
  darkQuery.addEventListener("change", () => apply(resolve(state.preference)))
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) apply(resolve(readPreference()))
  })
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useThemePreference = (): ThemePreference =>
  useSyncExternalStore(subscribe, () => state.preference)

/** The theme on screen, with System resolved to the operating system's setting. */
export const useResolvedTheme = (): ResolvedTheme =>
  useSyncExternalStore(subscribe, () => state.resolved)
