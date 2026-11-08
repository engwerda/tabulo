import { Sparkline } from "./Sparkline.tsx"
import { formatCount } from "./scale.ts"

type DeltaMode = "percent" | "absolute" | "points"

type StatProps = {
  readonly label: string
  readonly value: number
  readonly previous: number | null
  readonly format?: (value: number) => string
  /** Whether a rise is good news, which colors the change. */
  readonly goodWhen: "up" | "down" | "neutral"
  readonly deltaMode?: DeltaMode
  /** What the change compares with, such as "vs prior 90 days". */
  readonly comparison: string
}

const describeChange = (value: number, previous: number, mode: DeltaMode) => {
  const change = value - previous
  if (mode === "points") return `${change > 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))} pts`
  if (mode === "percent" && previous !== 0) {
    return `${change > 0 ? "+" : "−"}${Math.abs(Math.round((change / previous) * 100))}%`
  }
  return `${change > 0 ? "+" : "−"}${formatCount(Math.abs(change))}`
}

const Arrow = ({ up }: { readonly up: boolean }) => (
  <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden="true">
    <path
      d={up ? "M6 2.5 10 7H7v2.5H5V7H2z" : "M6 9.5 2 5h3V2.5h2V5h3z"}
      className="fill-current"
    />
  </svg>
)

/** The change against the previous period, colored by whether it is good news. */
const Change = ({
  value,
  previous,
  goodWhen,
  deltaMode,
  comparison,
  showComparison,
}: Required<Pick<StatProps, "value" | "previous" | "goodWhen" | "deltaMode" | "comparison">> & {
  readonly showComparison: boolean
}) => {
  if (previous === null) {
    return <span className="text-zinc-500 dark:text-zinc-400">No earlier data</span>
  }
  const change = value - previous
  const tone =
    change === 0 || goodWhen === "neutral"
      ? "text-zinc-600 dark:text-zinc-300"
      : change > 0 === (goodWhen === "up")
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-red-700 dark:text-red-400"
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${tone}`}>
        {change !== 0 && <Arrow up={change > 0} />}
        {change === 0 ? "No change" : describeChange(value, previous, deltaMode)}
      </span>
      <span className={showComparison ? "text-zinc-500 dark:text-zinc-400" : "sr-only"}>
        {comparison}
      </span>
    </span>
  )
}

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
}: StatProps & { readonly trend?: ReadonlyArray<number> | undefined }) => (
  <div className="flex min-w-0 flex-col gap-1.5 bg-white px-4 py-3.5 sm:px-5 sm:py-4 dark:bg-zinc-900">
    <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className="flex items-end justify-between gap-3">
      <span className="text-2xl/8 font-semibold tracking-tight text-zinc-950 dark:text-white">
        {format(value)}
      </span>
      {trend !== undefined && <Sparkline values={trend} width={64} height={24} />}
    </dd>
    <dd className="text-xs">
      <Change
        value={value}
        previous={previous}
        goodWhen={goodWhen}
        deltaMode={deltaMode}
        comparison={comparison}
        showComparison
      />
    </dd>
  </div>
)

/**
 * A secondary figure: smaller than a tile, with its change but without the comparison text,
 * which the row states once.
 */
export const StatFigure = ({
  label,
  value,
  previous,
  format = formatCount,
  goodWhen,
  deltaMode = "percent",
  comparison,
}: StatProps) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {format(value)}
      </span>
      <Change
        value={value}
        previous={previous}
        goodWhen={goodWhen}
        deltaMode={deltaMode}
        comparison={comparison}
        showComparison={false}
      />
    </dd>
  </div>
)
