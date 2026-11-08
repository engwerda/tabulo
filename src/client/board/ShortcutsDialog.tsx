import { useEffect, useRef } from "react"
import { isMac } from "../palette/keys.tsx"
import { SHORTCUTS, shortcutKeys } from "../palette/shortcuts.ts"
import { XIcon } from "../ui/icons.tsx"
import { buttonClass, Kbd } from "../ui/primitives.tsx"

const GROUPS = [
  {
    title: "Board",
    shortcuts: [
      { keys: ["/"], action: "Search cards" },
      { keys: ["N"], action: "New issue in the first column" },
      { keys: ["M"], action: "Show only cards assigned to me" },
      { keys: ["R"], action: "Refresh the board" },
      { keys: ["?"], action: "Show these shortcuts" },
    ],
  },
  {
    title: "Card details",
    shortcuts: [
      { keys: ["J"], action: "Next card in the column" },
      { keys: ["K"], action: "Previous card in the column" },
      { keys: ["A"], action: "Assign or unassign me" },
      { keys: ["O"], action: "Open in Forgejo" },
      { keys: [isMac ? "⌘" : "Ctrl", "Enter"], action: "Send a comment" },
      { keys: ["Esc"], action: "Close" },
    ],
  },
  {
    title: "Cards",
    shortcuts: [
      { keys: ["Tab"], action: "Go to the next column" },
      { keys: ["←", "↑", "↓", "→"], action: "Go to another card" },
      { keys: ["Home", "End"], action: "First or last card in the column" },
      { keys: ["Enter"], action: "Open the card's details" },
      { keys: ["."], action: "Open the card's menu" },
      { keys: ["Space"], action: "Pick the card up, then drop it" },
      { keys: ["←", "↑", "↓", "→"], action: "Move a picked-up card" },
      { keys: ["Esc"], action: "Cancel a move" },
    ],
  },
  {
    title: "Menus",
    shortcuts: [
      { keys: ["↓"], action: "Open a menu from its button" },
      { keys: ["↑", "↓"], action: "Go through its items" },
      { keys: ["Enter"], action: "Choose an item" },
      { keys: ["Esc"], action: "Close it" },
    ],
  },
] as const

/** The app-wide shortcuts in the board's shape; `?` is already in the Board group. */
const APP_GROUPS = (["General", "Go to"] as const).map((title) => ({
  title,
  shortcuts: SHORTCUTS.filter(
    (shortcut) => shortcut.group === title && shortcut.id !== "shortcuts",
  ).map((shortcut) => ({ keys: shortcutKeys(shortcut.id, isMac), action: shortcut.label })),
}))

const ARROWS: Readonly<Record<string, number>> = { "↑": 0, "→": 90, "↓": 180, "←": 270 }

/** Arrow keys as drawn arrows: the glyphs come from fallback fonts at uneven sizes. */
const KeyLabel = ({ name }: { name: string }) => {
  const rotation = ARROWS[name]
  if (rotation === undefined) return name
  return (
    <svg
      role="img"
      aria-label={`${["Up", "Right", "Down", "Left"][rotation / 90]} arrow`}
      viewBox="0 0 12 12"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path d="M6 10V2M2.75 5.25 6 2l3.25 3.25" />
    </svg>
  )
}

export const ShortcutsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (open && !element.open) {
      element.showModal()
      // The dialog itself takes focus, so no control wears a focus ring before it is used.
      element.focus()
    }
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
      tabIndex={-1}
      aria-labelledby="shortcuts-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] animate-pop-in overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-pop backdrop:bg-zinc-950/40 focus:outline-none lg:w-[min(52rem,calc(100vw-2rem))] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200/70 bg-white/95 pr-3 pl-5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <h2 id="shortcuts-title" className="text-[0.9375rem] font-semibold">
          Keyboard shortcuts
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className={buttonClass.icon}>
          <XIcon />
        </button>
      </div>
      <div className="grid gap-x-10 gap-y-6 px-5 pt-4 pb-6 lg:grid-cols-2">
        {[...GROUPS, ...APP_GROUPS].map((group) => (
          <section key={group.title} aria-labelledby={`shortcuts-${group.title}`}>
            <h3
              id={`shortcuts-${group.title}`}
              className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"
            >
              {group.title}
            </h3>
            <dl className="mt-1.5">
              {group.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.action}
                  className="flex min-h-8 items-center justify-between gap-4 py-1"
                >
                  <dt className="text-sm text-zinc-700 dark:text-zinc-300">{shortcut.action}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>
                        <KeyLabel name={key} />
                      </Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  )
}
