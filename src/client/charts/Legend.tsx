export type LegendItem = {
  readonly label: string
  readonly color: string
  readonly shape?: "square" | "line"
}

export const Legend = ({ items }: { readonly items: ReadonlyArray<LegendItem> }) => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
    {items.map(({ label, color, shape = "square" }) => (
      <li key={label} className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]"}
          style={{ background: color }}
        />
        {label}
      </li>
    ))}
  </ul>
)
