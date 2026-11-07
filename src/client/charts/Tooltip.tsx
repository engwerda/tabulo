import type { ReactNode } from "react"

export type TooltipRow = {
  readonly label: string
  readonly value: string
  /** The series color, shown as a short line key. */
  readonly color?: string | undefined
}

const TOOLTIP_HALF_WIDTH = 84

/** A readout over a chart: values lead, series names follow. */
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
}) => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute z-20 min-w-36 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-lg shadow-zinc-950/5 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-black/40"
    style={{
      left: Math.min(
        Math.max(x, TOOLTIP_HALF_WIDTH),
        Math.max(containerWidth - TOOLTIP_HALF_WIDTH, TOOLTIP_HALF_WIDTH),
      ),
      top: y - 10,
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
