import { useState } from "react"

export type Segment = { readonly label: string; readonly value: number; readonly color: string }

const percent = (value: number, total: number) =>
  total === 0 ? "0%" : `${Math.round((value / total) * 100)}%`

/**
 * One whole split into parts. Thin (8px, no text) beside figures that name the parts, or tall
 * (28px) with each part's share printed where it fits. Hovering a part names it.
 */
export const SegmentedBar = ({
  segments,
  variant = "thin",
  ariaLabel,
}: {
  readonly segments: ReadonlyArray<Segment>
  readonly variant?: "thin" | "tall"
  readonly ariaLabel: string
}) => {
  const [active, setActive] = useState<string | null>(null)
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const shown = segments.filter((segment) => segment.value > 0)
  const activeSegment = shown.find((segment) => segment.label === active)
  return (
    <div className="relative">
      <ul
        aria-label={ariaLabel}
        className={`chart-grow-x flex gap-0.5 ${variant === "tall" ? "h-7" : "h-2"}`}
      >
        {shown.map((segment) => {
          const share = segment.value / Math.max(total, 1)
          return (
            <li
              key={segment.label}
              onPointerEnter={() => setActive(segment.label)}
              onPointerLeave={() => setActive(null)}
              className={`flex min-w-0 items-center overflow-hidden ${
                variant === "tall"
                  ? "rounded px-2 text-[11px] font-semibold text-white"
                  : "rounded-full"
              } ${active !== null && active !== segment.label ? "opacity-60" : ""}`}
              style={{ flexGrow: segment.value, flexBasis: 0, background: segment.color }}
            >
              <span className="sr-only">
                {segment.label} {percent(segment.value, total)}
              </span>
              {variant === "tall" && share >= 0.12 && (
                <span aria-hidden="true">{percent(segment.value, total)}</span>
              )}
            </li>
          )
        })}
      </ul>
      {activeSegment !== undefined && (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute top-full left-0 z-20 mt-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs whitespace-nowrap shadow-md dark:border-zinc-700 dark:bg-zinc-900"
        >
          <span className="font-semibold tabular-nums">{percent(activeSegment.value, total)}</span>{" "}
          <span className="text-zinc-500 dark:text-zinc-400">{activeSegment.label}</span>
        </p>
      )}
    </div>
  )
}
