import type { ReactNode } from "react"
import { formatCount, linearScale, niceTicks } from "./scale.ts"
import { Tooltip, type TooltipRow } from "./Tooltip.tsx"
import { useActiveIndex } from "./use-active-index.ts"
import { useSize } from "./use-width.ts"

export type Category = {
  readonly key: string
  readonly label: string
  /** Still filling, as the current week is: drawn as a lighter, dashed outline. */
  readonly partial?: boolean
}

export type Series = {
  readonly label: string
  /** A CSS color, usually `var(--chart-n)`. */
  readonly color: string
  readonly values: ReadonlyArray<number>
}

const MARGIN = { top: 14, right: 4, bottom: 22, left: 34 }
const MAX_BAR = 24
const MIN_LABEL_GAP = 52
const SURFACE_GAP = 2

/** A bar from `base` to `end` (pixels) with rounded corners at the data end only. */
export const barPath = (x: number, width: number, base: number, end: number, radius = 4) => {
  const height = Math.abs(end - base)
  if (height < 0.5 || width <= 0) return ""
  const r = Math.min(radius, width / 2, height)
  const towards = end < base ? 1 : -1
  return [
    `M${x},${base}`,
    `V${end + towards * r}`,
    `Q${x},${end} ${x + r},${end}`,
    `H${x + width - r}`,
    `Q${x + width},${end} ${x + width},${end + towards * r}`,
    `V${base}Z`,
  ].join("")
}

/** Which category labels fit along the axis, counted back from the latest. */
const shownLabels = (count: number, plotWidth: number) => {
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / MIN_LABEL_GAP))))
  return (index: number) => (count - 1 - index) % every === 0
}

/** Measures the chart's box; the chart grows to fill a taller card. */
export const useBox = (minHeight: number) => {
  const [ref, size] = useSize<HTMLDivElement>()
  return { ref, width: size.width, height: Math.max(minHeight, size.height), minHeight }
}

/** The fill of a column, lighter and outlined for a partial category. */
const columnStyle = (color: string, partial: boolean | undefined) =>
  partial === true
    ? { fill: color, fillOpacity: 0.35, stroke: color, strokeDasharray: "3 2", strokeWidth: 1 }
    : { fill: color }

const growDelay = (index: number, count: number) => ({
  animationDelay: `${Math.round((index / Math.max(count, 1)) * 240)}ms`,
})

type FrameProps = {
  readonly categories: ReadonlyArray<Category>
  /** The measured box: the chart fills its card's free height, never less than `minHeight`. */
  readonly box: ReturnType<typeof useBox>
  readonly ariaLabel: string
  /** Tick values and their pixel positions. */
  readonly ticks: ReadonlyArray<{
    readonly value: number
    readonly y: number
    readonly label: string
  }>
  readonly tooltip: (index: number) => {
    readonly title: string
    readonly rows: ReadonlyArray<TooltipRow>
  }
  readonly tooltipY: (index: number) => number
  readonly children: (layout: {
    readonly x: (index: number) => number
    readonly band: number
    readonly bar: number
    readonly active: number | null
  }) => ReactNode
}

/** Axes, gridlines, hover band, and tooltip shared by the column charts. */
const ColumnFrame = ({
  categories,
  box,
  ariaLabel,
  ticks,
  tooltip,
  tooltipY,
  children,
}: FrameProps) => {
  const { ref, width, height, minHeight } = box
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const band = categories.length === 0 ? 0 : plotWidth / categories.length
  const bar = Math.max(1, Math.min(MAX_BAR, band * 0.62))
  const x = (index: number) => MARGIN.left + index * band + (band - bar) / 2
  const { active, handlers } = useActiveIndex(categories.length, (pointerX) => {
    const index = Math.floor((pointerX - MARGIN.left) / band)
    return index >= 0 && index < categories.length ? index : null
  })
  const showLabel = shownLabels(categories.length, plotWidth)
  const tip = active === null ? null : tooltip(active)

  return (
    <div ref={ref} className="relative flex-1" style={{ minHeight }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="absolute inset-0 block touch-pan-y overflow-visible focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          {...handlers}
        >
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={tick.y}
                y2={tick.y}
                className="stroke-chart-grid"
                shapeRendering="crispEdges"
              />
              <text
                x={MARGIN.left - 8}
                y={tick.y}
                dy="0.32em"
                textAnchor="end"
                className="fill-chart-axis text-[10px] tabular-nums"
              >
                {tick.label}
              </text>
            </g>
          ))}
          {active !== null && (
            <rect
              x={MARGIN.left + active * band}
              y={MARGIN.top}
              width={band}
              height={height - MARGIN.top - MARGIN.bottom}
              rx={4}
              className="fill-zinc-900/[0.04] dark:fill-white/[0.06]"
            />
          )}
          {children({ x, band, bar, active })}
          {categories.map((category, index) =>
            showLabel(index) ? (
              <text
                key={category.key}
                x={MARGIN.left + index * band + band / 2}
                y={height - 6}
                textAnchor="middle"
                className="fill-chart-axis text-[10px] tabular-nums"
              >
                {category.label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {tip !== null && active !== null && (
        <Tooltip
          x={MARGIN.left + active * band + band / 2}
          y={tooltipY(active)}
          containerWidth={width}
          title={tip.title}
          rows={tip.rows}
        />
      )}
    </div>
  )
}

/**
 * Columns per category, stacked bottom to top in series order with a surface gap between
 * segments. With one series and `capLabels`, each column shows its value on the cap.
 */
export const StackedColumns = ({
  categories,
  series,
  height = 200,
  ariaLabel,
  tooltipTitle,
  format = formatCount,
  capLabels = false,
}: {
  readonly categories: ReadonlyArray<Category>
  readonly series: ReadonlyArray<Series>
  readonly height?: number
  readonly ariaLabel: string
  readonly tooltipTitle: (index: number) => string
  readonly format?: (value: number) => string
  readonly capLabels?: boolean
}) => {
  const totals = categories.map((_, index) =>
    series.reduce((total, entry) => total + (entry.values[index] ?? 0), 0),
  )
  const box = useBox(height)
  const ticks = niceTicks(Math.max(...totals, 0), 3)
  const top = ticks.at(-1) ?? 1
  const y = linearScale([0, top], [box.height - MARGIN.bottom, MARGIN.top + (capLabels ? 10 : 0)])
  return (
    <ColumnFrame
      categories={categories}
      box={box}
      ariaLabel={ariaLabel}
      ticks={ticks.map((value) => ({ value, y: y(value), label: formatCount(value) }))}
      tooltip={(index) => ({
        title: tooltipTitle(index),
        rows: [...series].reverse().map((entry) => ({
          label: entry.label,
          value: format(entry.values[index] ?? 0),
          color: series.length > 1 ? entry.color : undefined,
        })),
      })}
      tooltipY={(index) => y(totals[index] ?? 0)}
    >
      {({ x, bar, active }) =>
        categories.map((category, index) => {
          let base = y(0)
          const segments = series.flatMap((entry, seriesIndex) => {
            const value = entry.values[index] ?? 0
            if (value <= 0) return []
            const end = base - (y(0) - y(value))
            const isTop = series
              .slice(seriesIndex + 1)
              .every((later) => (later.values[index] ?? 0) <= 0)
            const segment = (
              <path
                key={entry.label}
                d={
                  isTop
                    ? barPath(x(index), bar, base, end)
                    : `M${x(index)},${base}V${end}H${x(index) + bar}V${base}Z`
                }
                style={columnStyle(entry.color, category.partial)}
              />
            )
            base = end - SURFACE_GAP
            return [segment]
          })
          return (
            <g
              key={category.key}
              className="chart-rise"
              style={growDelay(index, categories.length)}
              opacity={active === null || active === index ? 1 : 0.55}
            >
              {segments}
              {capLabels && (totals[index] ?? 0) > 0 && (
                <text
                  x={x(index) + bar / 2}
                  y={y(totals[index] ?? 0) - 5}
                  textAnchor="middle"
                  className="fill-zinc-600 text-[10px] font-medium tabular-nums dark:fill-zinc-300"
                >
                  {format(totals[index] ?? 0)}
                </text>
              )}
            </g>
          )
        })
      }
    </ColumnFrame>
  )
}

/** Two series per category: one rises above the baseline, the other hangs below it. */
export const MirrorColumns = ({
  categories,
  up,
  down,
  height = 220,
  ariaLabel,
  tooltipTitle,
}: {
  readonly categories: ReadonlyArray<Category>
  readonly up: Series
  readonly down: Series
  readonly height?: number
  readonly ariaLabel: string
  readonly tooltipTitle: (index: number) => string
}) => {
  const box = useBox(height)
  const half = niceTicks(Math.max(...up.values, ...down.values, 0), 2)
  const top = half.at(-1) ?? 1
  const y = linearScale([-top, top], [box.height - MARGIN.bottom, MARGIN.top])
  const ticks = [...half.slice(1).map((value) => -value), ...half].sort((a, b) => a - b)
  return (
    <ColumnFrame
      categories={categories}
      box={box}
      ariaLabel={ariaLabel}
      ticks={ticks.map((value) => ({ value, y: y(value), label: formatCount(Math.abs(value)) }))}
      tooltip={(index) => ({
        title: tooltipTitle(index),
        rows: [up, down].map((entry) => ({
          label: entry.label,
          value: formatCount(entry.values[index] ?? 0),
          color: entry.color,
        })),
      })}
      tooltipY={(index) => y(up.values[index] ?? 0)}
    >
      {({ x, bar, band, active }) => (
        <>
          {categories.map((category, index) => (
            <g key={category.key} opacity={active === null || active === index ? 1 : 0.55}>
              <path
                className="chart-rise"
                style={{
                  ...growDelay(index, categories.length),
                  ...columnStyle(up.color, category.partial),
                }}
                d={barPath(x(index), bar, y(0) - 1, y(up.values[index] ?? 0) - 1)}
              />
              <path
                className="chart-drop"
                style={{
                  ...growDelay(index, categories.length),
                  ...columnStyle(down.color, category.partial),
                }}
                d={barPath(x(index), bar, y(0) + 1, y(-(down.values[index] ?? 0)) + 1)}
              />
            </g>
          ))}
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + categories.length * band}
            y1={y(0)}
            y2={y(0)}
            className="stroke-chart-axis"
            strokeOpacity={0.5}
            shapeRendering="crispEdges"
          />
        </>
      )}
    </ColumnFrame>
  )
}
