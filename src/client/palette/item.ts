import type { DashboardItem } from "../../shared/api.ts"
import type { Searchable } from "./rank.ts"

export type GlyphName =
  | "dashboard"
  | "board"
  | "insights"
  | "epics"
  | "repository"
  | "external"
  | "system"
  | "light"
  | "dark"
  | "link"
  | "keyboard"
  | "signout"
  | "issue"
  | "pull"
  | "recent"
  | "plus"
  | "refresh"
  | "search"
  | "person"
  | "tag"
  | "milestone"
  | "clear"
  | "settings"

export type RunContext = {
  readonly navigate: (to: string) => void
  readonly openShortcuts: () => void
  /** Lists every item of one group, such as the board's labels, until the user goes back. */
  readonly browse: (group: string) => void
  /** Keeps the palette open to report how `task` went, then closes it if it succeeded. */
  readonly report: (task: Promise<unknown>, success: string, failure: string) => void
  readonly signOut: () => void
}

export type PaletteItem = Searchable & {
  readonly icon: GlyphName
  /** A label's color, shown as a dot in place of the icon. */
  readonly color?: string
  /** An issue or pull request, which the row names in words so the two never look alike. */
  readonly kind?: { readonly type: DashboardItem["kind"]; readonly state: DashboardItem["state"] }
  /** Why the item is listed, such as "Review", in quiet text. */
  readonly hint?: string
  /** The setting or filter in effect, marked with a check and this word. */
  readonly current?: "Current" | "On"
  /** The keys that do the same outside the palette. */
  readonly keys?: ReadonlyArray<string>
  readonly external?: boolean
  /** What Enter does, when it is not "Select" or, for an external item, opening a new tab. */
  readonly enterLabel?: string
  /** A second way to open the item, with Ctrl or Cmd and Enter or a click. */
  readonly alternate?: { readonly label: string; readonly run: (context: RunContext) => void }
  /** Items of the issue search are not remembered: they are not there when the query is empty. */
  readonly remember: boolean
  readonly run: (context: RunContext) => void
}
