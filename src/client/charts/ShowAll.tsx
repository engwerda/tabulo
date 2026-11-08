import { touchTarget } from "../ui/primitives.tsx"

/** Under a list cut to its first rows: shows every row, or the first ones again. */
export const ShowAll = ({
  total,
  expanded,
  onToggle,
}: {
  readonly total: number
  readonly expanded: boolean
  readonly onToggle: () => void
}) => (
  <button
    type="button"
    aria-expanded={expanded}
    onClick={onToggle}
    className={`mt-3 self-start rounded-md text-xs font-medium text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-100 ${touchTarget}`}
  >
    {expanded ? "Show fewer" : `Show all ${total}`}
  </button>
)
