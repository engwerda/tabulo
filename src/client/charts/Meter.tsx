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
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="h-1.5 overflow-hidden rounded-full"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}
    >
      <div
        className="chart-grow-x h-full rounded-full"
        style={{ width: `${max === 0 ? 0 : (value / max) * 100}%`, background: color }}
      />
    </div>
  )
}
