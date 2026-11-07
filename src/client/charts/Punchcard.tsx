import { Tooltip } from "./Tooltip.tsx"
import { useActiveIndex } from "./use-active-index.ts"
import { useWidth } from "./use-width.ts"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const LEFT = 32
const BOTTOM = 18
const ROW = 26

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`

/** Events by weekday and hour: each dot's area grows with its count. */
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
  const [ref, width] = useWidth<HTMLDivElement>()
  const column = Math.max(0, (width - LEFT) / 24)
  const height = 7 * ROW + BOTTOM
  const max = Math.max(1, ...grid.flat())
  const radiusMax = Math.min(column, ROW) / 2 - 1.5
  const radius = (count: number) =>
    count === 0 ? 1.25 : Math.max(2, Math.sqrt(count / max) * radiusMax)
  const cx = (hour: number) => LEFT + hour * column + column / 2
  const cy = (day: number) => day * ROW + ROW / 2
  const { active, handlers } = useActiveIndex(
    7 * 24,
    (x, y) => {
      const hour = Math.floor((x - LEFT) / column)
      const day = Math.floor(y / ROW)
      return hour >= 0 && hour < 24 && day >= 0 && day < 7 ? day * 24 + hour : null
    },
    { rowStep: 24 },
  )
  const activeDay = active === null ? 0 : Math.floor(active / 24)
  const activeHour = active === null ? 0 : active % 24

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="block touch-pan-y overflow-visible focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          {...handlers}
        >
          {DAYS.map((day, index) => (
            <text key={day} x={0} y={cy(index)} dy="0.32em" className="fill-chart-axis text-[10px]">
              {day}
            </text>
          ))}
          {[0, 6, 12, 18].map((hour) => (
            <text
              key={hour}
              x={cx(hour)}
              y={height - 4}
              textAnchor="middle"
              className="fill-chart-axis text-[10px] tabular-nums"
            >
              {hourLabel(hour)}
            </text>
          ))}
          <g className="chart-fade">
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
      {active !== null && (
        <Tooltip
          x={cx(activeHour)}
          y={cy(activeDay) - radius(grid[activeDay]?.[activeHour] ?? 0)}
          containerWidth={width}
          title={`${DAYS[activeDay]} ${hourLabel(activeHour)}–${hourLabel((activeHour + 1) % 24)}`}
          rows={[{ label: unit, value: String(grid[activeDay]?.[activeHour] ?? 0) }]}
        />
      )}
    </div>
  )
}
