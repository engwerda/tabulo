import type { CSSProperties } from "react"

/**
 * A label on a soft tint of its Forgejo color. The text mixes the color toward black (or white
 * in dark mode), so any label color stays readable. A scoped label shows its scope dimmed.
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
      style={{ "--label": color } as CSSProperties}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--label)_28%,transparent)] bg-[color-mix(in_oklab,var(--label)_12%,transparent)] font-medium text-[color-mix(in_oklab,var(--label)_62%,black)] dark:border-[color-mix(in_oklab,var(--label)_35%,transparent)] dark:bg-[color-mix(in_oklab,var(--label)_16%,transparent)] dark:text-[color-mix(in_oklab,var(--label)_50%,white)] ${
        size === "sm" ? "px-1.5 py-px text-[0.6875rem] leading-4" : "px-2 py-0.5 text-xs"
      }`}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--label)" />
      <span className="truncate">
        {scope !== "" && <span className="opacity-65">{scope}/</span>}
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
  labels: ReadonlyArray<{ readonly name: string; readonly color: string }>
  size?: "sm" | "md" | undefined
  className?: string
}) =>
  labels.length === 0 ? null : (
    <ul className={`flex flex-wrap gap-1 ${className}`} aria-label="Labels">
      {labels.map((label) => (
        <li key={label.name} className="min-w-0 max-w-full">
          <LabelChip name={label.name} color={label.color} size={size} />
        </li>
      ))}
    </ul>
  )
