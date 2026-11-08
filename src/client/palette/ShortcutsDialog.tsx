import { type ReactNode, useLayoutEffect, useRef } from "react"
import { XIcon } from "../ui/icons.tsx"
import { buttonClass } from "../ui/primitives.tsx"
import { Key, ShortcutKeys } from "./keys.tsx"
import { MENU_KEYS, SHORTCUTS, type Shortcut } from "./shortcuts.ts"

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section aria-label={title}>
    <h3 className="px-2 pb-1 text-2xs font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
    <dl>{children}</dl>
  </section>
)

const Row = ({ label, keys }: { label: string; keys: ReactNode }) => (
  <div className="flex h-9 items-center justify-between gap-4 px-2">
    <dt className="truncate text-sm text-zinc-700 dark:text-zinc-300">{label}</dt>
    <dd className="flex shrink-0 items-center gap-1">{keys}</dd>
  </div>
)

const shortcutRows = (group: Shortcut["group"]) =>
  SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
    <Row key={shortcut.id} label={shortcut.label} keys={<ShortcutKeys id={shortcut.id} />} />
  ))

export const ShortcutsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null)
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
      aria-labelledby="shortcuts-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-1.5rem))] animate-palette-in overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-pop outline-none backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[3px] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 id="shortcuts-title" className="text-[0.9375rem] font-semibold tracking-tight">
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
      <div className="grid gap-x-6 gap-y-4 px-3 pb-4 sm:grid-cols-2">
        <div className="grid content-start gap-4">
          <Group title="General">{shortcutRows("General")}</Group>
          <Group title="In the command menu">
            {MENU_KEYS.map(({ keys, label }) => (
              <Row
                key={label}
                label={label}
                keys={keys.map((key) => <Key key={key} name={key} />)}
              />
            ))}
          </Group>
        </div>
        <Group title="Go to">{shortcutRows("Go to")}</Group>
      </div>
      <p className="border-t border-zinc-100 bg-zinc-50/70 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-400">
        Press <Key name="G" />, then the letter, within a second. Single keys do nothing while you
        type in a field.
      </p>
    </dialog>
  )
}
