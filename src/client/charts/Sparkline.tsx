import { linearScale } from "./scale.ts"

/** A trend without axes: the series in a quiet gray, the latest point in the accent. */
export const Sparkline = ({
  values,
  width = 96,
  height = 28,
  ariaLabel,
}: {
  readonly values: ReadonlyArray<number>
  readonly width?: number
  readonly height?: number
  readonly ariaLabel?: string
}) => {
  if (values.length < 2) return null
  const x = linearScale([0, values.length - 1], [3, width - 3])
  const y = linearScale([Math.min(...values, 0), Math.max(...values, 1)], [height - 3, 3])
  const line = `M${values.map((value, index) => `${x(index)},${y(value)}`).join("L")}`
  const last = values.length - 1
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel === undefined ? "presentation" : "img"}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel === undefined ? true : undefined}
      className="block shrink-0 overflow-visible"
    >
      <path
        d={`${line}L${x(last)},${height}L${x(0)},${height}Z`}
        className="fill-zinc-400/10 dark:fill-zinc-500/10"
      />
      <path
        d={line}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-zinc-400 dark:stroke-zinc-500"
      />
      <circle cx={x(last)} cy={y(values[last] ?? 0)} r={2.5} className="fill-chart-1" />
    </svg>
  )
}
