import type { ReactNode } from "react"
import { ArrowDownIcon, ArrowUpIcon, EnterIcon } from "../ui/icons.tsx"
import { Kbd } from "../ui/primitives.tsx"
import { type ShortcutId, shortcutKeys } from "./shortcuts.ts"

export const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "")

// Arrow characters sit at different heights in every font, so keys draw them as icons.
const KEY_ICONS: Record<string, { icon: ReactNode; name: string }> = {
  "↑": { icon: <ArrowUpIcon className="size-3" />, name: "Up arrow" },
  "↓": { icon: <ArrowDownIcon className="size-3" />, name: "Down arrow" },
  "↵": { icon: <EnterIcon className="size-3" />, name: "Enter" },
}

/** One key cap; arrows and Enter show as icons with a spoken name. */
export const Key = ({ name }: { name: string }) => {
  const drawn = KEY_ICONS[name]
  return (
    <Kbd>
      {drawn === undefined ? (
        name
      ) : (
        <>
          {drawn.icon}
          <span className="sr-only">{drawn.name}</span>
        </>
      )}
    </Kbd>
  )
}

export const ShortcutKeys = ({ id }: { id: ShortcutId }) => (
  <span className="inline-flex items-center gap-1">
    {shortcutKeys(id, isMac).map((key) => (
      <Key key={key} name={key} />
    ))}
  </span>
)
