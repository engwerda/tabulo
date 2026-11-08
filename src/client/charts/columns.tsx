import { type ReactNode, useId } from "react"
import { formatCount, labelStride, linearScale, niceTicks } from "./scale.ts"
import { Readout, Tooltip, type TooltipRow } from "./Tooltip.tsx"
import { useActiveIndex } from "./use-active-index.ts"
import { useEntrance } from "./use-entrance.ts"
import { useSize } from "./use-width.ts"

type Category = {
  readonly key: string
  readonly label: string
  /** Still filling, as the current week is: drawn hatched on a shaded band marked "so far". */
  readonly partial?: boolean
}

type Series = {
  readonly label: string
  /** A CSS color, usually `var(--chart-n)`. */
  readonly color: string
  readonly values: ReadonlyArray<number>
}

const MARGIN = { top: 16, right: 4, bottom: 22, left: 30 }
const MAX_BAR = 24
const MAX_GROUPED_BAR = 20
const MIN_LABEL_GAP = 52
const SURFACE_GAP = 2
// A partial column is a light tint of its color under diagonal stripes at full color. Opacity
// alone reads as a disabled control on a dark surface, where the tint turns muddy.
const PARTIAL_TINT = 0.22
const HATCH_SPACING = 4
const HATCH_WIDTH = 1.5

/** A column or a stacked segment, hatched with the frame's mask when it is still filling. */
const Bar = ({
  d,
  color,
  partial,
  hatch,
}: {
  readonly d: string
  readonly color: string
  readonly partial: boolean
  readonly hatch: string
}) =>
  partial ? (
    <>
      <path d={d} style={{ fill: color }} fillOpacity={PARTIAL_TINT} />
      <path d={d} style={{ fill: color }} mask={`url(#${hatch})`} />
    </>
  ) : (
    <path d={d} style={{ fill: color }} />
  )

/** A bar from `base` to `end` (pixels) with rounded corners at the data end only. */
const barPath = (x: number, width: number, base: number, end: number, radius = 4) => {
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

// Up to this many categories, such as histogram buckets, every label shows: each one names a
// different range, so none can be left for the reader to infer.
const ALWAYS_LABELED = 8

/** Which category labels fit along the axis, counted back from the latest. */
const shownLabels = (labels: ReadonlyArray<string>, plotWidth: number) => {
  const count = labels.length
  if (count <= ALWAYS_LABELED) return () => true
  const every = labelStride(labels, plotWidth, MIN_LABEL_GAP)
  return (index: number) => (count - 1 - index) % every === 0
}

/** Measures the chart's box; the chart grows to fill a taller card. */
const useBox = (minHeight: number) => {
  const [ref, size] = useSize<HTMLDivElement>()
  return { ref, width: size.width, height: Math.max(minHeight, size.height), minHeight }
}

const riseDelay = (index: number, count: number) => ({
  animationDelay: `${Math.round((index / Math.max(count, 1)) * 160)}ms`,
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
  readonly baseline: number
  readonly tooltip: (index: number) => {
    readonly title: string
    readonly rows: ReadonlyArray<TooltipRow>
  }
  readonly tooltipY: (index: number) => number
  readonly children: (layout: {
    readonly band: number
    readonly left: (index: number) => number
    readonly active: number | null
    /** The id of the stripe mask that `Bar` applies to partial columns. */
    readonly hatch: string
  }) => ReactNode
}

/** Axes, gridlines, the in-progress band, hover band, and tooltip shared by the column charts. */
const ColumnFrame = ({
  categories,
  box,
  ariaLabel,
  ticks,
  baseline,
  tooltip,
  tooltipY,
  children,
}: FrameProps) => {
  const { ref, width, height, minHeight } = box
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const band = categories.length === 0 ? 0 : plotWidth / categories.length
  const left = (index: number) => MARGIN.left + index * band
  const { active, handlers } = useActiveIndex(categories.length, (pointerX) => {
    const index = Math.floor((pointerX - MARGIN.left) / band)
    return index >= 0 && index < categories.length ? index : null
  })
  const showLabel = shownLabels(
    categories.map((category) => category.label),
    plotWidth,
  )
  const tip = active === null ? null : tooltip(active)
  const partial = categories.findIndex((category) => category.partial === true)
  const id = useId()
  const hatch = `${id}hatch`

  return (
    <div ref={ref} className="relative flex-1" style={{ minHeight }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          aria-label={ariaLabel}
          className="absolute inset-0 block touch-pan-y overflow-visible focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          {...handlers}
        >
          {partial >= 0 && (
            <defs>
              <pattern
                id={`${hatch}-stripes`}
                width={HATCH_SPACING}
                height={HATCH_SPACING}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={HATCH_WIDTH} height={HATCH_SPACING} fill="white" />
              </pattern>
              <mask id={hatch} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
                <rect width={width} height={height} fill={`url(#${hatch}-stripes)`} />
              </mask>
            </defs>
          )}
          {partial >= 0 && (
            <g>
              <rect
                x={left(partial) + 1}
                y={MARGIN.top}
                width={Math.max(0, band - 2)}
                height={Math.max(0, baseline - MARGIN.top)}
                rx={3}
                className="fill-zinc-100/70 dark:fill-zinc-800/40"
              />
              <text
                x={Math.min(left(partial) + band / 2, width - MARGIN.right)}
                y={MARGIN.top - 5}
                textAnchor={left(partial) + band / 2 + 18 > width ? "end" : "middle"}
                className="fill-chart-axis text-2xs"
              >
                so far
              </text>
            </g>
          )}
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={tick.y}
                y2={tick.y}
                className="stroke-chart-grid"
                strokeOpacity={tick.value === 0 ? 1 : 0.7}
                shapeRendering="crispEdges"
              />
              <text
                x={MARGIN.left - 8}
                y={tick.y}
                dy="0.32em"
                textAnchor="end"
                className="fill-chart-axis text-2xs tabular-nums"
              >
                {tick.label}
              </text>
            </g>
          ))}
          {active !== null && (
            <rect
              x={left(active)}
              y={MARGIN.top}
              width={band}
              height={baseline - MARGIN.top}
              rx={4}
              className="fill-zinc-900/[0.04] dark:fill-white/[0.05]"
            />
          )}
          {children({ band, left, active, hatch })}
          {categories.map((category, index) =>
            showLabel(index) ? (
              <text
                key={category.key}
                x={left(index) + band / 2}
                y={height - 6}
                textAnchor={
                  categories.length > ALWAYS_LABELED && index === categories.length - 1
                    ? "end"
                    : "middle"
                }
                dx={
                  categories.length > ALWAYS_LABELED && index === categories.length - 1
                    ? band / 2
                    : 0
                }
                className="fill-chart-axis text-2xs tabular-nums"
              >
                {category.label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {tip !== null && active !== null && (
        <Tooltip
          x={left(active) + band / 2}
          y={tooltipY(active)}
          containerWidth={width}
          title={tip.title}
          rows={tip.rows}
        />
      )}
      <Readout title={tip?.title} rows={tip?.rows} />
    </div>
  )
}

const signatureOf = (categories: ReadonlyArray<Category>, series: ReadonlyArray<Series>) =>
  `${categories.map((category) => category.key).join(",")}|${series
    .map((entry) => `${entry.label}:${entry.values.join(",")}`)
    .join(";")}`

const yAxis = (max: number, box: ReturnType<typeof useBox>, headroom: number) => {
  const ticks = niceTicks(max, 3)
  const y = linearScale([0, ticks.at(-1) ?? 1], [box.height - MARGIN.bottom, MARGIN.top + headroom])
  return { y, ticks: ticks.map((value) => ({ value, y: y(value), label: formatCount(value) })) }
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
  const { y, ticks } = yAxis(Math.max(...totals, 0), box, capLabels ? 12 : 0)
  const play = useEntrance(signatureOf(categories, series))
  return (
    <ColumnFrame
      categories={categories}
      box={box}
      ariaLabel={ariaLabel}
      ticks={ticks}
      baseline={y(0)}
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
      {({ band, left, active, hatch }) => {
        const bar = Math.max(1, Math.min(MAX_BAR, band * 0.62))
        return categories.map((category, index) => {
          const x = left(index) + (band - bar) / 2
          let base = y(0)
          const segments = series.flatMap((entry, seriesIndex) => {
            const value = entry.values[index] ?? 0
            if (value <= 0) return []
            const end = base - (y(0) - y(value))
            const isTop = series
              .slice(seriesIndex + 1)
              .every((later) => (later.values[index] ?? 0) <= 0)
            const segment = (
              <Bar
                key={entry.label}
                d={isTop ? barPath(x, bar, base, end) : `M${x},${base}V${end}H${x + bar}V${base}Z`}
                color={entry.color}
                partial={category.partial === true}
                hatch={hatch}
              />
            )
            base = end - SURFACE_GAP
            return [segment]
          })
          return (
            <g key={category.key} opacity={active === null || active === index ? 1 : 0.5}>
              <g
                className={play ? "chart-rise" : undefined}
                style={play ? riseDelay(index, categories.length) : undefined}
              >
                {segments}
              </g>
              {capLabels && (totals[index] ?? 0) > 0 && (
                <text
                  x={x + bar / 2}
                  y={y(totals[index] ?? 0) - 5}
                  textAnchor="middle"
                  className="fill-zinc-600 text-2xs font-medium tabular-nums dark:fill-zinc-300"
                >
                  {format(totals[index] ?? 0)}
                </text>
              )}
            </g>
          )
        })
      }}
    </ColumnFrame>
  )
}

/** Two or three series side by side per category, all rising from one baseline. */
export const GroupedColumns = ({
  categories,
  series,
  height = 220,
  ariaLabel,
  tooltipTitle,
}: {
  readonly categories: ReadonlyArray<Category>
  readonly series: ReadonlyArray<Series>
  readonly height?: number
  readonly ariaLabel: string
  readonly tooltipTitle: (index: number) => string
}) => {
  const box = useBox(height)
  const { y, ticks } = yAxis(Math.max(0, ...series.flatMap((entry) => entry.values)), box, 0)
  const play = useEntrance(signatureOf(categories, series))
  const count = Math.max(series.length, 1)
  return (
    <ColumnFrame
      categories={categories}
      box={box}
      ariaLabel={ariaLabel}
      ticks={ticks}
      baseline={y(0)}
      tooltip={(index) => ({
        title: tooltipTitle(index),
        rows: series.map((entry) => ({
          label: entry.label,
          value: formatCount(entry.values[index] ?? 0),
          color: entry.color,
        })),
      })}
      tooltipY={(index) => y(Math.max(0, ...series.map((entry) => entry.values[index] ?? 0)))}
    >
      {({ band, left, active, hatch }) => {
        const gap = band >= 12 ? SURFACE_GAP : 1
        const bar = Math.max(
          1,
          Math.min(MAX_GROUPED_BAR, (band * 0.72 - gap * (count - 1)) / count),
        )
        const group = bar * count + gap * (count - 1)
        return categories.map((category, index) => (
          <g key={category.key} opacity={active === null || active === index ? 1 : 0.5}>
            {series.map((entry, seriesIndex) => (
              <g
                key={entry.label}
                className={play ? "chart-rise" : undefined}
                style={play ? riseDelay(index, categories.length) : undefined}
              >
                <Bar
                  d={barPath(
                    left(index) + (band - group) / 2 + seriesIndex * (bar + gap),
                    bar,
                    y(0),
                    y(entry.values[index] ?? 0),
                    Math.min(4, bar / 2),
                  )}
                  color={entry.color}
                  partial={category.partial === true}
                  hatch={hatch}
                />
              </g>
            ))}
          </g>
        ))
      }}
    </ColumnFrame>
  )
}
