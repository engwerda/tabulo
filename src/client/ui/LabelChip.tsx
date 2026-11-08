/**
 * A label as a quiet chip: neutral text and border, with the label's Forgejo color only on its
 * dot, so cards with several labels stay calm and any label color stays readable. A scoped label
 * shows its scope in a lighter tone.
 */
export const LabelChip = ({
  name,
  color,
  size = "sm",
}: {
  name: string
  color: string
  size?: "sm" | "md" | undefined
}) => {
  const slash = name.lastIndexOf("/")
  const scope = slash > 0 ? name.slice(0, slash) : ""
  const value = slash > 0 ? name.slice(slash + 1) : name
  return (
    <span
      title={name}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 bg-white font-medium text-zinc-700 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-300 ${
        size === "sm" ? "px-1.5 py-px text-[0.6875rem] leading-4" : "px-2 py-0.5 text-xs"
      }`}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">
        {scope !== "" && <span className="text-zinc-500 dark:text-zinc-400">{scope}/</span>}
        {value}
      </span>
    </span>
  )
}

export const LabelList = ({
  labels,
  size,
  className = "",
}: {
  labels: ReadonlyArray<{ readonly id: number; readonly name: string; readonly color: string }>
  size?: "sm" | "md" | undefined
  className?: string
}) =>
  labels.length === 0 ? null : (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label="Labels">
      {labels.map((label) => (
        <li key={label.id} className="min-w-0 max-w-full">
          <LabelChip name={label.name} color={label.color} size={size} />
        </li>
      ))}
    </ul>
  )
