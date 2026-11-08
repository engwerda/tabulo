import { useEntrance } from "./use-entrance.ts"

/** A ratio against a whole: the fill carries the state, the track is a lighter step of its hue. */
export const Meter = ({
  value,
  max,
  tone = "accent",
  ariaLabel,
}: {
  readonly value: number
  readonly max: number
  readonly tone?: "accent" | "danger"
  readonly ariaLabel: string
}) => {
  const color = tone === "danger" ? "var(--chart-negative)" : "var(--chart-1)"
  const play = useEntrance(`meter:${ariaLabel}:${value}/${max}`)
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="h-1.5 overflow-hidden rounded-full"
      style={{
        background:
          max === 0 ? "var(--chart-grid)" : `color-mix(in oklab, ${color} 18%, transparent)`,
      }}
    >
      {value > 0 && (
        <div
          className={`h-full rounded-full ${play ? "chart-grow-x" : ""}`}
          style={{ width: `${(value / max) * 100}%`, background: color }}
        />
      )}
    </div>
  )
}
