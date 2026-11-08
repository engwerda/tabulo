import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from "react"
import { ArrowRightIcon, XIcon } from "../ui/icons.tsx"
import { buttonClass, Kbd } from "../ui/primitives.tsx"
import { isMac, Key } from "./keys.tsx"
import { MENU_KEYS, SHORTCUTS, type Shortcut, shortcutKeys } from "./shortcuts.ts"

export type ShortcutSection = {
  readonly title: string
  readonly rows: ReadonlyArray<{ readonly keys: ReadonlyArray<string>; readonly label: string }>
}

const appSection = (title: Shortcut["group"]): ShortcutSection => ({
  title,
  rows: SHORTCUTS.filter((shortcut) => shortcut.group === title).map((shortcut) => ({
    keys: shortcutKeys(shortcut.id, isMac),
    label: shortcut.label,
  })),
})

const APP_SECTIONS: ReadonlyArray<ShortcutSection> = [
  appSection("General"),
  { title: "In the command menu", rows: MENU_KEYS },
  appSection("Go to"),
]

// The page on screen lists its own shortcuts here, so the dialog shows them wherever it opens:
// from the page's own key or from the command menu.
let pageSections: ReadonlyArray<ShortcutSection> = []
const listeners = new Set<() => void>()
const publish = (sections: ReadonlyArray<ShortcutSection>) => {
  pageSections = sections
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Adds a page's shortcuts before the app-wide ones while the page is mounted. */
export const usePageShortcuts = (sections: ReadonlyArray<ShortcutSection>) => {
  useEffect(() => {
    publish(sections)
    return () => {
      if (pageSections === sections) publish([])
    }
  }, [sections])
}

const SIDE_ARROWS: Readonly<Record<string, string>> = { "←": "Left arrow", "→": "Right arrow" }

const ShortcutKey = ({ name }: { name: string }) => {
  const side = SIDE_ARROWS[name]
  if (side === undefined) return <Key name={name} />
  return (
    <Kbd>
      <ArrowRightIcon className={`size-3 ${name === "←" ? "rotate-180" : ""}`} />
      <span className="sr-only">{side}</span>
    </Kbd>
  )
}

/** Every shortcut that works where the user is: the page's own first, then the app's. */
export const ShortcutsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const page = useSyncExternalStore(subscribe, () => pageSections)
  // A layout effect closes the modal before the command menu's effect focuses its input, which
  // a still-open modal would block and its closing would undo.
  useLayoutEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (open && !element.open) {
      element.showModal()
      // The dialog itself takes focus, so the close button does not open with a focus ring.
      element.focus()
    }
    if (!open && element.open) element.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes a modal dialog natively; the click is on the backdrop
    <dialog
      ref={dialog}
      tabIndex={-1}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
      aria-labelledby={`${id}-title`}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-1.5rem))] animate-palette-in overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-pop outline-none backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[3px] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:backdrop:bg-black/60 ${
        page.length > 0 ? "lg:w-[min(52rem,calc(100vw-2rem))]" : ""
      }`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white/95 px-5 pt-4 pb-2 backdrop-blur dark:bg-zinc-900/95">
        <h2 id={`${id}-title`} className="text-[0.9375rem] font-semibold tracking-tight">
          Keyboard shortcuts
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className={`${buttonClass.iconSmall} -mr-1.5`}
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="gap-x-6 px-3 pb-2 sm:columns-2">
        {[...page, ...APP_SECTIONS].map((section, index) => (
          <section
            key={section.title}
            aria-labelledby={`${id}-${index}`}
            className="break-inside-avoid pb-4"
          >
            <h3
              id={`${id}-${index}`}
              className="px-2 pb-1 text-2xs font-medium text-zinc-500 dark:text-zinc-400"
            >
              {section.title}
            </h3>
            <dl>
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex min-h-9 items-center justify-between gap-4 px-2 py-1"
                >
                  <dt className="text-sm text-zinc-700 dark:text-zinc-300">{row.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {row.keys.map((key) => (
                      <ShortcutKey key={key} name={key} />
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="border-t border-zinc-100 bg-zinc-50/70 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-400">
        Press <Key name="G" />, then the letter, within a second. Single keys do nothing while you
        type in a field.
      </p>
    </dialog>
  )
}
