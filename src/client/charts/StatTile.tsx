import { Sparkline } from "./Sparkline.tsx"
import { formatCount } from "./scale.ts"

export type DeltaMode = "percent" | "absolute" | "points"

type StatTileProps = {
  readonly label: string
  readonly value: number | null
  readonly previous: number | null
  readonly format?: (value: number) => string
  /** Whether a rise is good news, which colors the change. */
  readonly goodWhen: "up" | "down" | "neutral"
  readonly deltaMode?: DeltaMode
  /** What the change compares with, such as "vs prior 90d". */
  readonly comparison: string
  readonly trend?: ReadonlyArray<number> | undefined
}

const describeChange = (value: number, previous: number, mode: DeltaMode) => {
  const change = value - previous
  if (mode === "points") return `${change > 0 ? "+" : ""}${Math.round(change * 100)} pts`
  if (mode === "percent" && previous !== 0) {
    return `${change > 0 ? "+" : ""}${Math.round((change / previous) * 100)}%`
  }
  return `${change > 0 ? "+" : ""}${formatCount(change)}`
}

const Arrow = ({ up }: { readonly up: boolean }) => (
  <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
    <path
      d={up ? "M6 2.5 10 7H7v2.5H5V7H2z" : "M6 9.5 2 5h3V2.5h2V5h3z"}
      className="fill-current"
    />
  </svg>
)

/** A headline number with its change against the previous period and an optional trend. */
export const StatTile = ({
  label,
  value,
  previous,
  format = formatCount,
  goodWhen,
  deltaMode = "percent",
  comparison,
  trend,
}: StatTileProps) => {
  const change = value === null || previous === null ? null : value - previous
  const good = change !== null && change !== 0 && change > 0 === (goodWhen === "up")
  const tone =
    change === null || change === 0 || goodWhen === "neutral"
      ? "text-zinc-500 dark:text-zinc-400"
      : good
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-red-700 dark:text-red-400"
  return (
    <div className="chart-card flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-[1.75rem]/8 dark:text-white">
          {value === null ? (
            <span className="text-zinc-400 dark:text-zinc-600">–</span>
          ) : (
            format(value)
          )}
        </p>
        {trend !== undefined && <Sparkline values={trend} width={72} height={26} />}
      </div>
      <p className={`flex items-center gap-1 text-xs ${tone}`}>
        {change !== null && change !== 0 && <Arrow up={change > 0} />}
        <span className="font-medium whitespace-nowrap tabular-nums">
          {value === null
            ? "No data"
            : previous === null
              ? "No earlier data"
              : change === 0
                ? "No change"
                : describeChange(value, previous, deltaMode)}
        </span>
        {value !== null && previous !== null && (
          <span className="truncate text-zinc-500 dark:text-zinc-400">{comparison}</span>
        )}
      </p>
    </div>
  )
}
