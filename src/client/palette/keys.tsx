import { type ShortcutId, shortcutKeys } from "./shortcuts.ts"

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "")

export const Kbd = ({ children }: { children: string }) => (
  <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md border border-zinc-200 bg-zinc-50 px-1 font-sans text-[0.6875rem] font-medium text-zinc-500 shadow-[0_1px_0_rgb(0_0_0/0.04)] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:shadow-none">
    {children}
  </kbd>
)

export const ShortcutKeys = ({ id }: { id: ShortcutId }) => (
  <span className="inline-flex items-center gap-1">
    {shortcutKeys(id, isMac).map((key) => (
      <Kbd key={key}>{key}</Kbd>
    ))}
  </span>
)
