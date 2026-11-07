import { useEffect, useRef } from "react"
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
      { keys: ["Esc"], action: "Close" },
    ],
  },
  {
    title: "Cards",
    shortcuts: [
      { keys: ["←", "↑", "↓", "→"], action: "Go to another card" },
      { keys: ["Home", "End"], action: "First or last card in the column" },
      { keys: ["Enter"], action: "Open the card's details" },
      { keys: ["."], action: "Open the card's menu" },
      { keys: ["Space"], action: "Pick the card up, then drop it" },
      { keys: ["←", "↑", "↓", "→"], action: "Move a picked-up card" },
      { keys: ["Esc"], action: "Cancel a move" },
    ],
  },
] as const

export const ShortcutsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] animate-pop-in overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-pop backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
        <h2 id="shortcuts-title" className="text-base font-semibold">
          Keyboard shortcuts
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className={buttonClass.icon}>
          <XIcon />
        </button>
      </div>
      <div className="grid gap-6 px-5 py-5">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              {group.title}
            </h3>
            <dl className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.action} className="flex items-center justify-between py-2">
                  <dt className="text-sm text-zinc-700 dark:text-zinc-300">{shortcut.action}</dt>
                  <dd className="flex gap-1">
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
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
