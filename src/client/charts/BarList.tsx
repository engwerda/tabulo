import { type ReactNode, useState } from "react"
import { touchTarget } from "../ui/primitives.tsx"
import { useEntrance } from "./use-entrance.ts"

type BarSegment = { readonly label: string; readonly value: number; readonly color: string }

type BarListRow = {
  readonly key: string
  readonly name: ReactNode
  /** A swatch or avatar before the name. */
  readonly lead?: ReactNode
  readonly segments: ReadonlyArray<BarSegment>
  /** The value printed at the bar's tip. */
  readonly display: ReactNode
  readonly href?: string | undefined
}

const total = (row: BarListRow) => row.segments.reduce((sum, segment) => sum + segment.value, 0)

/**
 * Ranked horizontal bars on one baseline, largest first. Rows with several segments stack them
 * with a surface gap; the legend beside the list names the segments. When every row has the same
 * total the bars would all be equal and say nothing, so only the numbers show. Past `limit` rows
 * the rest wait behind a "Show all" button.
 */
export const BarList = ({
  rows,
  ariaLabel,
  limit = rows.length,
}: {
  readonly rows: ReadonlyArray<BarListRow>
  readonly ariaLabel: string
  readonly limit?: number
}) => {
  const [expanded, setExpanded] = useState(false)
  const totals = rows.map(total)
  const max = Math.max(1, ...totals)
  const bars = new Set(totals).size > 1
  const shown = expanded ? rows : rows.slice(0, limit)
  const play = useEntrance(
    `bars:${rows.map((row, index) => `${row.key}=${totals[index]}`).join(",")}`,
  )
  return (
    <div className="flex flex-col">
      <ul aria-label={ariaLabel} className={`flex flex-col ${bars ? "gap-2.5" : "gap-2"}`}>
        {shown.map((row, index) => {
          const description = row.segments
            .map((segment) => `${segment.value} ${segment.label}`)
            .join(", ")
          const name = (
            <span className="flex min-w-0 items-center gap-2 text-sm">
              {row.lead}
              <span className="truncate text-zinc-800 dark:text-zinc-200">{row.name}</span>
            </span>
          )
          return (
            <li key={row.key}>
              <div className="flex items-center justify-between gap-3">
                {row.href === undefined ? (
                  name
                ) : (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 rounded hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    {name}
                  </a>
                )}
                <span
                  className="shrink-0 text-xs font-medium text-zinc-700 tabular-nums dark:text-zinc-300"
                  title={description}
                >
                  {row.display}
                </span>
              </div>
              {bars && (
                <div
                  role="img"
                  aria-label={description}
                  className={`mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full ${play ? "chart-grow-x" : ""}`}
                  style={{
                    width: `${Math.max(((totals[index] ?? 0) / max) * 100, 1.5)}%`,
                    animationDelay: play ? `${index * 30}ms` : undefined,
                  }}
                >
                  {row.segments.map((segment) =>
                    segment.value > 0 ? (
                      <span
                        key={segment.label}
                        className="h-full rounded-full"
                        style={{ flexGrow: segment.value, background: segment.color }}
                      />
                    ) : null,
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > limit && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className={`mt-3 self-start rounded-md text-xs font-medium text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-100 ${touchTarget}`}
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}
