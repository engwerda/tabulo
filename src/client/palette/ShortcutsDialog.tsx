import { useLayoutEffect, useRef } from "react"
import { Kbd, ShortcutKeys } from "./keys.tsx"
import { MENU_KEYS, SHORTCUTS } from "./shortcuts.ts"

const GROUPS = ["General", "Go to"] as const

export const ShortcutsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  // A layout effect closes the modal before the command menu's effect focuses its input, which
  // a still-open modal would block and its closing would undo.
  useLayoutEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes a modal dialog natively; the click is on the backdrop
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
      aria-labelledby="shortcuts-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-1.5rem))] animate-palette-in overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-[0_24px_64px_-12px_rgb(0_0_0/0.35)] backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[3px] dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 dark:border-zinc-800">
        <h2 id="shortcuts-title" className="text-base font-semibold tracking-tight">
          Keyboard shortcuts
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Close <Kbd>Esc</Kbd>
        </button>
      </div>
      <div className="grid gap-6 px-5 py-5">
        {GROUPS.map((group) => (
          <section key={group} aria-labelledby={`shortcuts-${group}`}>
            <h3
              id={`shortcuts-${group}`}
              className="text-[0.6875rem] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
            >
              {group}
            </h3>
            <dl className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                <div key={shortcut.id} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-sm text-zinc-700 dark:text-zinc-300">{shortcut.label}</dt>
                  <dd>
                    <ShortcutKeys id={shortcut.id} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section aria-labelledby="shortcuts-menu">
          <h3
            id="shortcuts-menu"
            className="text-[0.6875rem] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
          >
            In the command menu
          </h3>
          <dl className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            {MENU_KEYS.map(({ keys, label }) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-sm text-zinc-700 dark:text-zinc-300">{label}</dt>
                <dd className="flex gap-1">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Shortcuts without a modifier are ignored while you type in a field. Press G, then the
          letter within a second.
        </p>
      </div>
    </dialog>
  )
}
