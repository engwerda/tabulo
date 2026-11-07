import { useSyncExternalStore } from "react"

export type ThemeChoice = "system" | "light" | "dark"

const STORAGE_KEY = "tabulo.theme"
const listeners = new Set<() => void>()

const read = (): ThemeChoice => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : "system"
  } catch {
    return "system"
  }
}

let current: ThemeChoice = read()

/** Puts the choice on <html>; styles.css follows the system when neither class is set. */
const apply = (choice: ThemeChoice) => {
  const root = document.documentElement
  root.classList.toggle("light", choice === "light")
  root.classList.toggle("dark", choice === "dark")
  root.style.colorScheme = choice === "system" ? "" : choice
}

apply(current)

export const setTheme = (choice: ThemeChoice) => {
  current = choice
  apply(choice)
  try {
    if (choice === "system") window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, choice)
  } catch {}
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useTheme = () => useSyncExternalStore(subscribe, () => current)
