import { type ReactNode, useId, useState } from "react"

type ChartCardProps = {
  readonly title: string
  readonly description?: ReactNode
  /** Controls shown beside the title, such as a series switch. */
  readonly actions?: ReactNode
  /** The chart's table view. Screen readers always get it; sighted readers can switch to it. */
  readonly table?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}

export const ChartCard = ({
  title,
  description,
  actions,
  table,
  className = "",
  children,
}: ChartCardProps) => {
  const headingId = useId()
  const [showTable, setShowTable] = useState(false)
  return (
    <section
      aria-labelledby={headingId}
      className={`chart-card flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold tracking-tight">
            {title}
          </h2>
          {description !== undefined && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {table !== undefined && (
            <button
              type="button"
              aria-pressed={showTable}
              onClick={() => setShowTable((current) => !current)}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 aria-pressed:bg-zinc-100 aria-pressed:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-800 dark:aria-pressed:text-zinc-100"
            >
              Table
            </button>
          )}
        </div>
      </header>
      {showTable ? (
        table
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
          {table !== undefined && <div className="sr-only">{table}</div>}
        </div>
      )}
    </section>
  )
}
