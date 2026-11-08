import { type ReactNode, type Ref, useId, useState } from "react"
import { cardClass, touchTarget } from "../ui/primitives.tsx"
import { HiddenTable } from "./DataTable.tsx"

type ChartCardProps = {
  readonly title: string
  readonly description?: ReactNode
  /** Controls shown beside the title, such as a series switch. */
  readonly actions?: ReactNode
  /** The chart's table view. Screen readers always get it; sighted readers can switch to it. */
  readonly table?: ReactNode
  readonly className?: string
  readonly ref?: Ref<HTMLElement>
  readonly children: ReactNode
}

const TableIcon = () => (
  <svg
    viewBox="0 0 16 16"
    className="size-3.5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
  >
    <rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2" />
    <path d="M2.25 6.25h11.5M2.25 9.75h11.5M6.5 6.25v7" />
  </svg>
)

/** Switches a chart to its table view and back. */
export const TableToggle = ({
  pressed,
  onToggle,
}: {
  readonly pressed: boolean
  readonly onToggle: () => void
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    title={pressed ? "Show the chart" : "Show as a table"}
    onClick={onToggle}
    className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs pointer-coarse:h-11 pointer-coarse:px-3 font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
      pressed
        ? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
    } ${touchTarget}`}
  >
    <TableIcon />
    <span className="max-sm:sr-only">Table</span>
  </button>
)

export const ChartCard = ({
  title,
  description,
  actions,
  table,
  className = "",
  ref,
  children,
}: ChartCardProps) => {
  const headingId = useId()
  const [showTable, setShowTable] = useState(false)
  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={`${cardClass} flex min-w-0 flex-col p-4 sm:p-5 ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          {description !== undefined && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
        {(actions !== undefined || table !== undefined) && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {table !== undefined && (
              <TableToggle
                pressed={showTable}
                onToggle={() => setShowTable((current) => !current)}
              />
            )}
          </div>
        )}
      </header>
      {showTable ? (
        table
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
          {table !== undefined && <HiddenTable>{table}</HiddenTable>}
        </div>
      )}
    </section>
  )
}
