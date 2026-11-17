import type { PanelIssue } from "./panel-issue.ts"

/** The address parameter that names the previewed issue as `owner/repo#12`, percent-encoded. */
export const PREVIEW_PARAM = "item"

/** `owner/repo#number` of the issue a preview shows, as its rows and the address write it. */
export const issueRef = (issue: PanelIssue) => `${issue.owner}/${issue.repo}#${issue.number}`

/** The address parameters with `ref` as the preview, or without a preview for null. */
export const withPreviewParam = (params: URLSearchParams, ref: string | null) => {
  const next = new URLSearchParams(params)
  if (ref === null) next.delete(PREVIEW_PARAM)
  else next.set(PREVIEW_PARAM, ref)
  return next
}

const withoutPreview = (search: string) =>
  withPreviewParam(new URLSearchParams(search), null).toString()

/** The history state of an entry that opening a preview added: the address it was opened from. */
export type PreviewEntry = { readonly previewOpenedFrom: string }

export const openedEntry = (search: string): PreviewEntry => ({
  previewOpenedFrom: withoutPreview(search),
})

/**
 * How closing the preview leaves the address `search`. Opening a preview adds a history entry
 * that records the address it was opened from, so Back closes it, and closing goes back to the
 * entry before it while the rest of the address is unchanged. Without that record, such as for a
 * preview in the address on load, the entry before may not be the page, so closing replaces the
 * entry instead. The record lives in the entry itself, so it holds after Back, Forward, and a
 * reload.
 */
export const closeMove = (state: unknown, search: string): "back" | "replace" =>
  typeof state === "object" &&
  state !== null &&
  "previewOpenedFrom" in state &&
  state.previewOpenedFrom === withoutPreview(search)
    ? "back"
    : "replace"

/**
 * What the preview of `ref` shows, and what to hold for the next render. A preview keeps what it
 * showed when a refetch no longer lists the issue, such as after Mark read, until it closes; once
 * no preview is open the hold goes, so Forward finds nothing stale.
 */
export const holdPreview = <P extends { readonly issue: PanelIssue }>(
  held: P | null,
  found: P | undefined,
  ref: string | null,
): { readonly shown: P | undefined; readonly held: P | null } => {
  if (ref === null) return { shown: undefined, held: null }
  if (found !== undefined) return { shown: found, held: found }
  const same = held !== null && issueRef(held.issue).toLowerCase() === ref.toLowerCase()
  return { shown: same ? held : undefined, held }
}

/** The notice that closes a preview the page does not list. */
export type MissNotice = { readonly title: string; readonly detail: string }

/**
 * What a key pressed while a preview is open does: `O` opens the issue in Forgejo and `Escape`
 * closes the preview. Keys with a modifier, keys someone types into a field, and keys while a
 * dialog is open over the page do nothing here.
 */
export const previewKeyAction = (
  event: {
    readonly key: string
    readonly metaKey: boolean
    readonly ctrlKey: boolean
    readonly altKey: boolean
    readonly defaultPrevented: boolean
  },
  typing: boolean,
  dialogOpen: boolean,
): "close" | "forgejo" | null => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return null
  if (typing || dialogOpen) return null
  if (event.key === "Escape") return "close"
  if (event.key === "o" || event.key === "O") return "forgejo"
  return null
}

/** Where a preview was opened from: a section, by its id, and the row's place in it. */
export type PreviewOrigin = { readonly section: string; readonly index: number }

/** A section of the page as focus sees it: the preview reference of each row link, in order. */
export type SectionRows = {
  readonly section: string
  /** Null for a row whose link opens Forgejo rather than a preview. */
  readonly refs: ReadonlyArray<string | null>
}

/** A row link to focus, by its place in its section, or the section's heading. */
export type FocusTarget =
  | { readonly section: string; readonly row: number }
  | { readonly section: string; readonly row: "heading" }

/**
 * Where focus goes when the preview of `ref` closes: the issue's row in the section it was opened
 * from, else its first row on the page, else the row now in the opener's place, else that
 * section's heading. Without an origin, or when a refresh took the origin's section off the page,
 * it counts as opened from the first row of `fallback`, the section the page names for it, such
 * as the one that Mark read takes rows from. `sections` come in page order; null when neither the
 * issue nor the section to fall back on is on the page.
 */
export const focusAfterPreview = (
  sections: ReadonlyArray<SectionRows>,
  ref: string,
  origin: PreviewOrigin | null,
  fallback: string | null,
): FocusTarget | null => {
  const wanted = ref.toLowerCase()
  const isIssue = (row: string | null) => row?.toLowerCase() === wanted
  const opened =
    origin === null ? undefined : sections.find((rows) => rows.section === origin.section)
  const home = opened ?? sections.find((rows) => rows.section === fallback)
  for (const rows of home === undefined ? sections : [home, ...sections]) {
    const row = rows.refs.findIndex(isIssue)
    if (row !== -1) return { section: rows.section, row }
  }
  if (home === undefined) return null
  if (home.refs.length === 0) return { section: home.section, row: "heading" }
  return {
    section: home.section,
    row: Math.min(
      Math.max(opened === undefined ? 0 : (origin?.index ?? 0), 0),
      home.refs.length - 1,
    ),
  }
}
