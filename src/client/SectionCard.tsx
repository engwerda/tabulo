import type { ReactNode } from "react"
import type { Section } from "../shared/api.ts"

type SectionCardProps<A> = {
  readonly title: string
  readonly empty: string
  readonly section: Section<A>
  readonly itemKey: (item: A) => string | number
  readonly renderItem: (item: A) => ReactNode
  readonly onRetry: () => void
  readonly retrying: boolean
}

export const SectionCard = <A,>({
  title,
  empty,
  section,
  itemKey,
  renderItem,
  onRetry,
  retrying,
}: SectionCardProps<A>) => {
  const headingId = `section-${title.toLowerCase().replaceAll(" ", "-")}`
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 id={headingId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {section._tag === "Loaded" && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {section.total}
          </span>
        )}
      </header>
      {section._tag === "Failed" ? (
        <div role="alert" className="flex flex-col items-start gap-3 px-4 py-5 text-sm">
          <p className="text-red-700 dark:text-red-400">Could not load: {section.message}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : section.items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {section.items.map((item) => (
              <li key={itemKey(item)}>{renderItem(item)}</li>
            ))}
          </ul>
          {section.total > section.items.length && (
            <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Showing {section.items.length} of {section.total}
            </p>
          )}
        </>
      )}
    </section>
  )
}
