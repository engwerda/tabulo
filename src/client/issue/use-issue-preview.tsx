import { type MouseEvent, type ReactNode, Suspense, useEffect, useRef } from "react"
import { useSearchParams } from "wouter"
import { isMac } from "../palette/keys.tsx"
import { type ShortcutSection, usePageShortcuts } from "../palette/ShortcutsDialog.tsx"
import { isTypingTarget } from "../ui/primitives.tsx"
import { useToast } from "../ui/toast.tsx"
import type { PanelIssue } from "./panel-issue.ts"
import {
  closeMove,
  focusAfterPreview,
  holdPreview,
  issueRef,
  type MissNotice,
  openedEntry,
  PREVIEW_PARAM,
  type PreviewOrigin,
  previewKeyAction,
  withPreviewParam,
} from "./preview.ts"

/** Opens the preview of `ref` from the link that was clicked. */
export type OpenPreview = (ref: string, link: HTMLAnchorElement) => void

/** What a page's panel gets to open another preview, close this one, and give focus back. */
export type PreviewControls = {
  readonly open: OpenPreview
  readonly close: () => void
  readonly restoreFocus: () => void
}

/** The keys a page handles while a preview is open. */
const PREVIEW_SHORTCUTS: ReadonlyArray<ShortcutSection> = [
  {
    title: "Preview",
    rows: [
      { keys: ["O"], label: "Open in Forgejo" },
      { keys: [isMac ? "⌘" : "Ctrl", "↵"], label: "Send a comment" },
      { keys: ["Esc"], label: "Close" },
    ],
  },
]

/** Marks the element whose row links focus returns to: a dashboard section or an epic's card. */
export const previewSection = (id: string) => ({ "data-preview-section": id })

/**
 * A row link's props. A plain primary click, or Enter, opens the preview of `ref`. The link keeps
 * Forgejo's address, so a click with a modifier key or the middle button still opens Forgejo in a
 * new tab. A row whose link opens only Forgejo passes null, so it keeps its place among the rows.
 */
export const previewLink = (ref: string | null, onPreview: OpenPreview) =>
  ref === null
    ? { "data-preview-row": "" }
    : {
        "data-preview-row": ref,
        onClick: (event: MouseEvent<HTMLAnchorElement>) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return
          }
          event.preventDefault()
          onPreview(ref, event.currentTarget)
        },
      }

type PageSection = { readonly id: string; readonly element: HTMLElement }

const sectionOf = (element: HTMLElement): PageSection => ({
  id: element.dataset.previewSection ?? "",
  element,
})

/** A section's row links that show; the children of a collapsed epic are in the page but hidden. */
const rowsOf = ({ element }: PageSection) =>
  [...element.querySelectorAll<HTMLElement>("[data-preview-row]")].filter(
    (row) => row.getClientRects().length > 0,
  )

const rowRef = (row: HTMLElement) => row.dataset.previewRow || null

const pageSections = () =>
  [...document.querySelectorAll<HTMLElement>("[data-preview-section]")].map(sectionOf)

const originOf = (link: HTMLElement): PreviewOrigin | null => {
  const element = link.closest<HTMLElement>("[data-preview-section]")
  if (element === null) return null
  const section = sectionOf(element)
  return { section: section.id, index: rowsOf(section).indexOf(link) }
}

/** What a page tells its preview. */
export type PreviewSource<P extends { readonly issue: PanelIssue }> = {
  /** What `ref` names in the page's loaded data; undefined when nothing loaded lists it. */
  readonly find: (ref: string) => P | undefined
  /** The page's last read succeeded and came after the page opened, so a miss is current. */
  readonly fresh: boolean
  /** The notice that closes a preview the page does not list; null keeps it in the address. */
  readonly missing: (ref: string) => MissNotice | null
  /** The section a preview that no row opened counts as opened from, by its `previewSection` id. */
  readonly homeSection: (preview: P) => string | null
  /** The page's panel, inside a Suspense boundary for a lazily loaded one. */
  readonly render: (preview: P, controls: PreviewControls) => ReactNode
}

/**
 * The preview that `?item=` names, and opening and closing it: the history entry, the issue a
 * refetch no longer lists, the notice for an address the page does not list, the keys, and where
 * focus returns. Rows open it through `previewLink`, inside elements marked with `previewSection`.
 */
export const useIssuePreview = <P extends { readonly issue: PanelIssue }>({
  find,
  fresh,
  missing,
  homeSection,
  render,
}: PreviewSource<P>) => {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const ref = params.get(PREVIEW_PARAM)
  const setRef = (value: string | null, options: { replace: boolean; state?: unknown }) =>
    setParams((current) => withPreviewParam(current, value), options)

  const held = useRef<P | null>(null)
  const hold = holdPreview(held.current, ref === null ? undefined : find(ref), ref)
  held.current = hold.held
  const shown = hold.shown

  const opener = useRef<PreviewOrigin | null>(null)
  // A preview restored by a reload or reached through history takes its issue's row as its opener
  // while the row is there, so focus can return to that place after Mark read removes it.
  useEffect(() => {
    if (ref === null) opener.current = null
    else if (shown !== undefined && opener.current === null) {
      const wanted = issueRef(shown.issue).toLowerCase()
      for (const section of pageSections()) {
        const index = rowsOf(section).findIndex((row) => rowRef(row)?.toLowerCase() === wanted)
        if (index !== -1) {
          opener.current = { section: section.id, index }
          break
        }
      }
    }
  })
  const open: OpenPreview = (next, link) => {
    // A link in the panel itself switches the preview and keeps the row that opened the first.
    opener.current = originOf(link) ?? opener.current
    setRef(
      next,
      ref === null
        ? { replace: false, state: openedEntry(window.location.search) }
        : { replace: true, state: window.history.state },
    )
  }
  // Leaving the page with a preview open unmounts the panel after the next page has rendered, and
  // focus must not jump to a row of that page.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const restoreFocus = () => {
    if (shown === undefined || !mounted.current) return
    const sections = pageSections().map((section) => ({ ...section, rows: rowsOf(section) }))
    const target = focusAfterPreview(
      sections.map(({ id, rows }) => ({ section: id, refs: rows.map(rowRef) })),
      issueRef(shown.issue),
      opener.current,
      homeSection(shown),
    )
    const at = sections.find(({ id }) => id === target?.section)
    if (target === null || at === undefined) return
    ;(target.row === "heading"
      ? at.element.querySelector<HTMLElement>("h2")
      : at.rows[target.row]
    )?.focus()
  }
  const close = () => {
    if (closeMove(window.history.state, window.location.search) === "back") window.history.back()
    else setRef(null, { replace: true })
    restoreFocus()
  }

  // A preview in the address that the page does not list, such as an old link.
  useEffect(() => {
    if (ref === null || !fresh || shown !== undefined) return
    const notice = missing(ref)
    if (notice === null) return
    toast({ tone: "warning", ...notice })
    setRef(null, { replace: true })
  })

  usePageShortcuts(PREVIEW_SHORTCUTS)
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {})
  shortcuts.current = (event) => {
    if (shown === undefined) return
    const action = previewKeyAction(
      event,
      isTypingTarget(event.target),
      document.querySelector("dialog[open]") !== null,
    )
    if (action === null) return
    if (action === "close") close()
    else window.open(shown.issue.url, "_blank", "noreferrer")
    event.preventDefault()
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event)
    document.addEventListener("keydown", listener)
    return () => document.removeEventListener("keydown", listener)
  }, [])

  const panel = shown !== undefined && (
    <Suspense fallback={null}>{render(shown, { open, close, restoreFocus })}</Suspense>
  )
  return { open, panel }
}
