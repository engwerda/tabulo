import { formatCount, linearScale, niceTicks } from "./scale.ts"
import { Tooltip } from "./Tooltip.tsx"
import { useActiveIndex } from "./use-active-index.ts"
import { useSize } from "./use-width.ts"

const MARGIN = { top: 16, right: 12, bottom: 22, left: 34 }
const MIN_LABEL_GAP = 56

/** One series over time: a 2px line over a faint wash, with a crosshair that snaps to points. */
export const AreaChart = ({
  labels,
  values,
  color = "var(--chart-1)",
  seriesLabel,
  height: requestedHeight = 200,
  ariaLabel,
  tooltipTitle,
  format = formatCount,
}: {
  /** One axis label per point. */
  readonly labels: ReadonlyArray<string>
  readonly values: ReadonlyArray<number>
  readonly color?: string
  readonly seriesLabel: string
  readonly height?: number
  readonly ariaLabel: string
  readonly tooltipTitle: (index: number) => string
  readonly format?: (value: number) => string
}) => {
  const [ref, size] = useSize<HTMLDivElement>()
  const minHeight = requestedHeight
  const { width } = size
  const height = Math.max(minHeight, size.height)
  const count = values.length
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const ticks = niceTicks(Math.max(...values, 0), 3)
  const y = linearScale([0, ticks.at(-1) ?? 1], [height - MARGIN.bottom, MARGIN.top])
  const x = (index: number) =>
    count <= 1 ? MARGIN.left + plotWidth / 2 : MARGIN.left + (index / (count - 1)) * plotWidth
  const { active, handlers } = useActiveIndex(count, (pointerX) =>
    count === 0
      ? null
      : Math.min(
          count - 1,
          Math.max(
            0,
            Math.round(((pointerX - MARGIN.left) / Math.max(plotWidth, 1)) * (count - 1)),
          ),
        ),
  )
  const points = values.map((value, index) => `${x(index)},${y(value)}`)
  const line = `M${points.join("L")}`
  const area = `${line}L${x(count - 1)},${y(0)}L${x(0)},${y(0)}Z`
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / MIN_LABEL_GAP))))
  const last = count - 1
  const lastValue = values[last] ?? 0

  return (
    <div ref={ref} className="relative flex-1" style={{ minHeight }}>
      {width > 0 && count > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="absolute inset-0 block touch-pan-y overflow-visible focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          {...handlers}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-chart-grid"
                shapeRendering="crispEdges"
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-chart-axis text-[10px] tabular-nums"
              >
                {formatCount(tick)}
              </text>
            </g>
          ))}
          <g className="chart-fade">
            <path d={area} style={{ fill: color }} fillOpacity={0.1} />
            <path
              d={line}
              fill="none"
              style={{ stroke: color }}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={x(last)}
              cy={y(lastValue)}
              r={4}
              style={{ fill: color }}
              className="stroke-white dark:stroke-zinc-900"
              strokeWidth={2}
            />
          </g>
          {active !== null && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={MARGIN.top}
                y2={height - MARGIN.bottom}
                className="stroke-chart-axis"
                strokeOpacity={0.6}
                shapeRendering="crispEdges"
              />
              <circle
                cx={x(active)}
                cy={y(values[active] ?? 0)}
                r={4.5}
                style={{ fill: color }}
                className="stroke-white dark:stroke-zinc-900"
                strokeWidth={2}
              />
            </g>
          )}
          {labels.map((label, index) =>
            (last - index) % every === 0 ? (
              <text
                // biome-ignore lint/suspicious/noArrayIndexKey: labels can repeat
                key={index}
                x={x(index)}
                y={height - 6}
                textAnchor={index === 0 && count > 1 ? "start" : index === last ? "end" : "middle"}
                className="fill-chart-axis text-[10px] tabular-nums"
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {active !== null && (
        <Tooltip
          x={x(active)}
          y={y(values[active] ?? 0)}
          containerWidth={width}
          title={tooltipTitle(active)}
          rows={[{ label: seriesLabel, value: format(values[active] ?? 0) }]}
        />
      )}
    </div>
  )
}
