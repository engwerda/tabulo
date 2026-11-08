import { Readout, Tooltip } from "./Tooltip.tsx"
import { useActiveIndex } from "./use-active-index.ts"
import { useEntrance } from "./use-entrance.ts"
import { useSize } from "./use-width.ts"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const LEFT = 32
const BOTTOM = 18
const MIN_ROW = 26
const MAX_ROW = 36

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`

/**
 * Events by weekday and hour: each dot's area grows with its count. The rows grow, up to a
 * limit, to fill a taller card.
 */
export const Punchcard = ({
  grid,
  ariaLabel,
  unit = "events",
}: {
  /** Seven rows, Monday first, of 24 hourly counts. */
  readonly grid: ReadonlyArray<ReadonlyArray<number>>
  readonly ariaLabel: string
  readonly unit?: string
}) => {
  const [ref, size] = useSize<HTMLDivElement>()
  const { width } = size
  const row = Math.min(MAX_ROW, Math.max(MIN_ROW, (size.height - BOTTOM) / 7))
  const height = 7 * row + BOTTOM
  const column = Math.max(0, (width - LEFT) / 24)
  const max = Math.max(1, ...grid.flat())
  const radiusMax = Math.min(column, MIN_ROW) / 2 - 1.5
  const radius = (count: number) =>
    count === 0 ? 1.25 : Math.max(2, Math.sqrt(count / max) * radiusMax)
  const cx = (hour: number) => LEFT + hour * column + column / 2
  const top = Math.max(0, (size.height - height) / 2)
  const cy = (day: number) => top + day * row + row / 2
  const play = useEntrance(`punchcard:${grid.map((hours) => hours.join(",")).join(";")}`)
  const { active, handlers } = useActiveIndex(
    7 * 24,
    (x, y) => {
      const hour = Math.floor((x - LEFT) / column)
      const day = Math.floor((y - top) / row)
      return hour >= 0 && hour < 24 && day >= 0 && day < 7 ? day * 24 + hour : null
    },
    { rowStep: 24 },
  )
  const activeDay = active === null ? 0 : Math.floor(active / 24)
  const activeHour = active === null ? 0 : active % 24
  const tip =
    active === null
      ? null
      : {
          title: `${DAYS[activeDay]} ${hourLabel(activeHour)}–${hourLabel((activeHour + 1) % 24)}`,
          rows: [{ label: unit, value: String(grid[activeDay]?.[activeHour] ?? 0) }],
        }

  return (
    <div ref={ref} className="relative flex-1" style={{ minHeight: 7 * MIN_ROW + BOTTOM }}>
      {width > 0 && (
        <svg
          width={width}
          height={Math.max(height, size.height)}
          aria-label={ariaLabel}
          className="absolute inset-0 block touch-pan-y overflow-visible focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          {...handlers}
        >
          {DAYS.map((day, index) => (
            <text key={day} x={0} y={cy(index)} dy="0.32em" className="fill-chart-axis text-2xs">
              {day}
            </text>
          ))}
          {[0, 6, 12, 18].map((hour) => (
            <text
              key={hour}
              x={cx(hour)}
              y={top + height - 4}
              textAnchor="middle"
              className="fill-chart-axis text-2xs tabular-nums"
            >
              {hourLabel(hour)}
            </text>
          ))}
          <g className={play ? "chart-fade" : undefined}>
            {grid.map((hours, day) =>
              hours.map((count, hour) => (
                <circle
                  // biome-ignore lint/suspicious/noArrayIndexKey: positions are fixed
                  key={`${day}-${hour}`}
                  cx={cx(hour)}
                  cy={cy(day)}
                  r={radius(count)}
                  className={count === 0 ? "fill-chart-grid" : "fill-chart-1"}
                  fillOpacity={count === 0 ? 1 : active === day * 24 + hour ? 1 : 0.82}
                  stroke={active === day * 24 + hour ? "currentColor" : "none"}
                  strokeWidth={1.5}
                />
              )),
            )}
          </g>
        </svg>
      )}
      {tip !== null && (
        <Tooltip
          x={cx(activeHour)}
          y={cy(activeDay) - radius(grid[activeDay]?.[activeHour] ?? 0)}
          containerWidth={width}
          title={tip.title}
          rows={tip.rows}
        />
      )}
      <Readout title={tip?.title} rows={tip?.rows} />
    </div>
  )
}
