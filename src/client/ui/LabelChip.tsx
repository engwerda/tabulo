type Label = { readonly id: number; readonly name: string; readonly color: string }

/**
 * A label as a quiet chip: a soft neutral fill and text, with the label's Forgejo color only on
 * its dot, so cards with several labels stay calm and any label color stays readable. A scoped
 * label shows its scope in a lighter tone, or, with `compact`, only to assistive technology.
 */
export const LabelChip = ({
  name,
  color,
  size = "sm",
  compact = false,
}: {
  name: string
  color: string
  size?: "sm" | "md" | undefined
  compact?: boolean | undefined
}) => {
  const slash = name.lastIndexOf("/")
  const scope = slash > 0 ? name.slice(0, slash) : ""
  const value = slash > 0 ? name.slice(slash + 1) : name
  return (
    <span
      title={name}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md bg-zinc-100 font-medium text-zinc-800 dark:bg-zinc-700/40 dark:text-zinc-200 ${
        size === "sm" ? "h-5 px-1.5 text-2xs" : "h-6 px-2 text-xs"
      }`}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 rounded-full ${size === "sm" ? "size-1.5" : "size-2"}`}
        style={{ backgroundColor: color }}
      />
      <span className="truncate">
        {scope !== "" && (
          <span className={compact ? "sr-only" : "text-zinc-600 dark:text-zinc-400"}>{scope}/</span>
        )}
        {value}
      </span>
    </span>
  )
}

/**
 * The labels in a wrapping row. With `max`, the first `max` show and a "+N" chip stands for the
 * rest, whose names its tooltip lists.
 */
export const LabelList = ({
  labels,
  size,
  className = "",
  max,
  compact,
}: {
  labels: ReadonlyArray<Label>
  size?: "sm" | "md" | undefined
  className?: string
  max?: number | undefined
  compact?: boolean | undefined
}) => {
  if (labels.length === 0) return null
  const shown = max === undefined ? labels : labels.slice(0, max)
  const rest = labels.slice(shown.length)
  return (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label="Labels">
      {shown.map((label) => (
        <li key={label.id} className="min-w-0 max-w-full">
          <LabelChip name={label.name} color={label.color} size={size} compact={compact} />
        </li>
      ))}
      {rest.length > 0 && (
        <li
          title={rest.map((label) => label.name).join(", ")}
          className={`inline-flex shrink-0 items-center rounded-md bg-zinc-100 font-medium text-zinc-600 tabular-nums dark:bg-zinc-700/40 dark:text-zinc-400 ${
            size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-2xs"
          }`}
        >
          <span aria-hidden="true">+{rest.length}</span>
          <span className="sr-only">{rest.map((label) => label.name).join(", ")}</span>
        </li>
      )}
    </ul>
  )
}
