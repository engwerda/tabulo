import type { ReactNode } from "react"

export type BarSegment = { readonly label: string; readonly value: number; readonly color: string }

export type BarListRow = {
  readonly key: string
  readonly name: ReactNode
  /** A swatch or avatar before the name. */
  readonly lead?: ReactNode
  readonly segments: ReadonlyArray<BarSegment>
  /** The value printed at the bar's tip. */
  readonly display: string
  readonly href?: string | undefined
}

/**
 * Ranked horizontal bars on one baseline, largest first. Rows with several segments stack them
 * with a surface gap; the legend beside the list names the segments.
 */
export const BarList = ({
  rows,
  ariaLabel,
}: {
  readonly rows: ReadonlyArray<BarListRow>
  readonly ariaLabel: string
}) => {
  const max = Math.max(
    1,
    ...rows.map((row) => row.segments.reduce((total, segment) => total + segment.value, 0)),
  )
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {rows.map((row, index) => {
        const total = row.segments.reduce((sum, segment) => sum + segment.value, 0)
        const description = row.segments
          .map((segment) => `${segment.value} ${segment.label}`)
          .join(", ")
        const name = (
          <span className="flex min-w-0 items-center gap-2 text-xs">
            {row.lead}
            <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
              {row.name}
            </span>
          </span>
        )
        return (
          <li key={row.key} className="group">
            <div className="mb-1 flex items-center justify-between gap-3">
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
                className="shrink-0 text-xs font-semibold text-zinc-700 tabular-nums dark:text-zinc-300"
                title={description}
              >
                {row.display}
              </span>
            </div>
            <div
              role="img"
              aria-label={description}
              className="chart-grow-x flex h-1.5 gap-0.5 overflow-hidden rounded-full"
              style={{
                width: `${Math.max((total / max) * 100, 1.5)}%`,
                animationDelay: `${index * 40}ms`,
              }}
            >
              {row.segments.map((segment) =>
                segment.value > 0 ? (
                  <span
                    key={segment.label}
                    className="h-full rounded-full transition-[filter] group-hover:brightness-110"
                    style={{ flexGrow: segment.value, background: segment.color }}
                  />
                ) : null,
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
