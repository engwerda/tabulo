import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { formatLongDay } from "./scale.ts"
import { Readout, Tooltip } from "./Tooltip.tsx"
import { useActiveIndex } from "./use-active-index.ts"
import { useEntrance } from "./use-entrance.ts"
import { useWidth } from "./use-width.ts"

export type CalendarDay = { readonly date: string; readonly count: number }

const ROW_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""]
const LEFT = 28
const TOP = 16
const GAP = 3
const MIN_CELL = 9
const MAX_CELL = 15
const LEVEL_MIX = [0, 28, 50, 74, 100]

const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

/** Four steps of one hue: each step holds about a quarter of the days with contributions. */
const levelsFor = (days: ReadonlyArray<CalendarDay>) => {
  const counts = days
    .map((day) => day.count)
    .filter((count) => count > 0)
    .sort((a, b) => a - b)
  const at = (q: number) => counts[Math.floor((counts.length - 1) * q)] ?? 0
  const bounds = [at(0.25), at(0.5), at(0.75)]
  return (count: number) => (count === 0 ? 0 : 1 + bounds.filter((bound) => count > bound).length)
}

export const levelColor = (level: number) =>
  level === 0
    ? "var(--chart-grid)"
    : `color-mix(in oklab, var(--chart-1) ${LEVEL_MIX[level]}%, var(--chart-grid))`

/**
 * A year of days as weeks (columns) by weekday (rows, Monday first). Narrow screens scroll the
 * weeks sideways, starting at the latest week, while the weekday names stay in place and a fade
 * on the left edge shows that earlier weeks lie that way.
 */
export const CalendarHeatmap = ({
  days,
  ariaLabel,
  unit = "contributions",
}: {
  readonly days: ReadonlyArray<CalendarDay>
  readonly ariaLabel: string
  readonly unit?: string
}) => {
  const [ref, width] = useWidth<HTMLDivElement>()
  const entrance = useEntrance(`${days.length}:${days[0]?.date}:${days.at(-1)?.date}`)
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const offset = days[0] === undefined ? 0 : weekdayOf(days[0].date)
  const weeks = Math.ceil((days.length + offset) / 7)
  const cell = Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor((width - LEFT) / weeks) - GAP))
  const pitch = cell + GAP
  const svgWidth = weeks * pitch - GAP
  const height = TOP + 7 * pitch
  const level = levelsFor(days)
  const position = (index: number) => {
    const slot = index + offset
    return { x: Math.floor(slot / 7) * pitch, y: TOP + (slot % 7) * pitch }
  }
  const { active, handlers } = useActiveIndex(
    days.length,
    (x, y) => {
      const column = Math.floor(x / pitch)
      const row = Math.floor((y - TOP) / pitch)
      const index = column * 7 + row - offset
      return row >= 0 && row < 7 && column >= 0 && index >= 0 && index < days.length ? index : null
    },
    { step: 7, rowStep: 1 },
  )

  useLayoutEffect(() => {
    const element = scroller.current
    if (element === null || width === 0) return
    element.scrollLeft = element.scrollWidth
    // A scroll that the new width clamps to 0 fires no scroll event, so read it back here.
    setScrollLeft(element.scrollLeft)
  }, [width])

  const months = days.flatMap((day, index) => {
    if (!day.date.endsWith("-01") && index !== 0) return []
    const { x } = position(index)
    return [
      {
        x,
        label: new Date(`${day.date}T00:00:00Z`).toLocaleString("en", {
          month: "short",
          timeZone: "UTC",
        }),
      },
    ]
  })
  const activeDay = active === null ? undefined : days[active]
  const activePosition = active === null ? null : position(active)
  const activeX = activePosition?.x

  // Keeps a cell reached with the arrow keys inside the scrolled view.
  useEffect(() => {
    const element = scroller.current
    if (element === null || activeX === undefined) return
    if (activeX < element.scrollLeft) element.scrollLeft = activeX
    else if (activeX + cell > element.scrollLeft + element.clientWidth) {
      element.scrollLeft = activeX + cell - element.clientWidth
    }
  }, [activeX, cell])
  const tip =
    activeDay === undefined
      ? null
      : {
          title: formatLongDay(activeDay.date),
          rows: [{ label: unit, value: String(activeDay.count) }],
        }

  return (
    <div ref={ref} className="relative">
      <div className="flex">
        {width > 0 && (
          <svg aria-hidden="true" width={LEFT} height={height} className="shrink-0">
            {ROW_LABELS.map((label, row) =>
              label === "" ? null : (
                <text
                  key={label}
                  x={0}
                  y={TOP + row * pitch + cell / 2}
                  dy="0.32em"
                  className="fill-chart-axis text-2xs"
                >
                  {label}
                </text>
              ),
            )}
          </svg>
        )}
        <div
          ref={scroller}
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
          className={`min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-1 ${
            scrollLeft > 1 && svgWidth > width - LEFT
              ? "[mask-image:linear-gradient(to_right,transparent,black_2rem)]"
              : ""
          }`}
        >
          {width > 0 && (
            <svg
              width={svgWidth}
              height={height}
              aria-label={ariaLabel}
              className="block touch-pan-x focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              {...handlers}
            >
              {months
                .filter((month, index) => index === 0 || month.x - (months[index - 1]?.x ?? 0) > 24)
                .map((month) => (
                  <text key={month.x} x={month.x} y={10} className="fill-chart-axis text-2xs">
                    {month.label}
                  </text>
                ))}
              <g className={entrance ? "chart-fade" : undefined}>
                {days.map((day, index) => {
                  const { x, y } = position(index)
                  return (
                    <rect
                      key={day.date}
                      x={x}
                      y={y}
                      width={cell}
                      height={cell}
                      rx={2.5}
                      style={{ fill: levelColor(level(day.count)) }}
                      className={active === index ? "stroke-zinc-900 dark:stroke-white" : undefined}
                      strokeWidth={active === index ? 1.5 : 0}
                    />
                  )
                })}
              </g>
            </svg>
          )}
        </div>
      </div>
      {tip !== null && activePosition !== null && (
        <Tooltip
          x={LEFT + activePosition.x - scrollLeft + cell / 2}
          y={activePosition.y}
          containerWidth={width}
          title={tip.title}
          rows={tip.rows}
        />
      )}
      <Readout title={tip?.title} rows={tip?.rows} />
      <div className="mt-2 flex items-center justify-end gap-1 text-2xs text-zinc-500 dark:text-zinc-400">
        Less
        {LEVEL_MIX.map((_, step) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the steps are fixed
            key={step}
            className="size-2.5 rounded-[3px]"
            style={{ background: levelColor(step) }}
          />
        ))}
        More
      </div>
    </div>
  )
}
