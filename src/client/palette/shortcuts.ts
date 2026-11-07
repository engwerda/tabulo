/** The keyboard shortcuts, as data: the key handler and the help dialog both read this. */

export type ShortcutId =
  | "palette"
  | "shortcuts"
  | "go-dashboard"
  | "go-board"
  | "go-insights"
  | "go-epics"

type Trigger =
  | { readonly type: "mod"; readonly key: string }
  | { readonly type: "key"; readonly key: string }
  | { readonly type: "sequence"; readonly keys: readonly [string, string] }

export type Shortcut = {
  readonly id: ShortcutId
  readonly group: "General" | "Go to"
  readonly label: string
  readonly trigger: Trigger
}

export const SHORTCUTS: ReadonlyArray<Shortcut> = [
  {
    id: "palette",
    group: "General",
    label: "Open the command menu",
    trigger: { type: "mod", key: "k" },
  },
  {
    id: "shortcuts",
    group: "General",
    label: "Show keyboard shortcuts",
    trigger: { type: "key", key: "?" },
  },
  {
    id: "go-dashboard",
    group: "Go to",
    label: "Dashboard",
    trigger: { type: "sequence", keys: ["g", "d"] },
  },
  {
    id: "go-board",
    group: "Go to",
    label: "Board",
    trigger: { type: "sequence", keys: ["g", "b"] },
  },
  {
    id: "go-insights",
    group: "Go to",
    label: "Insights",
    trigger: { type: "sequence", keys: ["g", "i"] },
  },
  {
    id: "go-epics",
    group: "Go to",
    label: "Epics",
    trigger: { type: "sequence", keys: ["g", "e"] },
  },
]

export const shortcutKeys = (id: ShortcutId, mac: boolean): ReadonlyArray<string> => {
  const shortcut = SHORTCUTS.find((candidate) => candidate.id === id)
  if (shortcut === undefined) return []
  const { trigger } = shortcut
  switch (trigger.type) {
    case "mod":
      return [mac ? "⌘" : "Ctrl", trigger.key.toUpperCase()]
    case "key":
      return [trigger.key]
    case "sequence":
      return trigger.keys.map((key) => key.toUpperCase())
  }
}

/** How long `g` waits for its second key. */
export const SEQUENCE_TIMEOUT_MS = 1000

export type KeyInfo = {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
}

/** The first key of a sequence that was pressed and is waiting for its second. */
export type PendingKey = { readonly key: string; readonly at: number } | null

export type KeyResolution = {
  readonly shortcut: ShortcutId | null
  readonly pending: PendingKey
}

const plain = (event: KeyInfo) => !event.metaKey && !event.ctrlKey && !event.altKey

/**
 * Decides what a keystroke does. Modifier chords work anywhere. Plain keys and sequences are
 * ignored while `typing`, so text can contain `?` and `g`.
 */
export const resolveKey = (
  event: KeyInfo,
  pending: PendingKey,
  now: number,
  typing: boolean,
): KeyResolution => {
  const key = event.key.toLowerCase()
  for (const { id, trigger } of SHORTCUTS) {
    if (
      trigger.type === "mod" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      key === trigger.key
    ) {
      return { shortcut: id, pending: null }
    }
  }
  if (typing || !plain(event)) return { shortcut: null, pending: null }
  const waiting = pending !== null && now - pending.at <= SEQUENCE_TIMEOUT_MS ? pending.key : null
  for (const { id, trigger } of SHORTCUTS) {
    if (trigger.type === "key" && event.key === trigger.key) return { shortcut: id, pending: null }
    if (trigger.type === "sequence" && waiting === trigger.keys[0] && key === trigger.keys[1]) {
      return { shortcut: id, pending: null }
    }
  }
  const starts = SHORTCUTS.some(
    ({ trigger }) => trigger.type === "sequence" && trigger.keys[0] === key,
  )
  return { shortcut: null, pending: starts ? { key, at: now } : null }
}
