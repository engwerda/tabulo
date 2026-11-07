import type { ReactNode } from "react"

export type TooltipRow = {
  readonly label: string
  readonly value: string
  /** The series color, shown as a short line key. */
  readonly color?: string | undefined
}

const TOOLTIP_HALF_WIDTH = 84
// The title line with padding, and each row: enough to tell whether the tooltip fits above.
const TOOLTIP_BASE_HEIGHT = 32
const TOOLTIP_ROW_HEIGHT = 18
const TOOLTIP_GAP = 10

/** Tells screen readers about the point a reader moved to; the tooltip is hidden from them. */
export const Readout = ({
  title,
  rows = [],
}: {
  readonly title: string | undefined
  readonly rows?: ReadonlyArray<TooltipRow> | undefined
}) => (
  <p className="sr-only" aria-live="polite">
    {title === undefined
      ? ""
      : [title, ...rows.map((row) => `${row.value} ${row.label}`)].join(", ")}
  </p>
)

/**
 * A readout over a chart: values lead, series names follow. It sits above `y`, or below it when
 * the chart has no room above.
 */
export const Tooltip = ({
  x,
  y,
  containerWidth,
  title,
  rows,
  children,
}: {
  readonly x: number
  readonly y: number
  readonly containerWidth: number
  readonly title: string
  readonly rows?: ReadonlyArray<TooltipRow>
  readonly children?: ReactNode
}) => {
  const below = y - TOOLTIP_GAP < TOOLTIP_BASE_HEIGHT + (rows?.length ?? 0) * TOOLTIP_ROW_HEIGHT
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-20 min-w-36 -translate-x-1/2 ${below ? "" : "-translate-y-full"} rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-lg shadow-zinc-950/5 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-black/40`}
      style={{
        left: Math.min(
          Math.max(x, TOOLTIP_HALF_WIDTH),
          Math.max(containerWidth - TOOLTIP_HALF_WIDTH, TOOLTIP_HALF_WIDTH),
        ),
        top: below ? y + TOOLTIP_GAP : y - TOOLTIP_GAP,
      }}
    >
      <p className="mb-1 font-medium whitespace-nowrap text-zinc-500 dark:text-zinc-400">{title}</p>
      {rows?.map((row) => (
        <p key={row.label} className="flex items-center gap-2 whitespace-nowrap">
          {row.color !== undefined && (
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: row.color }} />
          )}
          <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
            {row.value}
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">{row.label}</span>
        </p>
      ))}
      {children}
    </div>
  )
}
