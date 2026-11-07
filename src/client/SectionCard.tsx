import type { ReactNode } from "react"
import type { Section } from "../shared/api.ts"
import { buttonClass } from "./ui/primitives.tsx"

type SectionCardProps<A> = {
  readonly id: string
  readonly title: string
  readonly icon: ReactNode
  readonly empty: string
  readonly section: Section<A>
  readonly itemKey: (item: A) => string | number
  readonly renderItem: (item: A) => ReactNode
  readonly onRetry: () => void
  readonly retrying: boolean
}

export const SectionCard = <A,>({
  id,
  title,
  icon,
  empty,
  section,
  itemKey,
  renderItem,
  onRetry,
  retrying,
}: SectionCardProps<A>) => {
  const headingId = `${id}-heading`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <span className="text-zinc-400">{icon}</span>
        <h2 id={headingId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {section._tag === "Loaded" && (
          <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
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
            className={buttonClass.secondary}
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : section.items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {section.items.map((item) => (
              <li key={itemKey(item)}>{renderItem(item)}</li>
            ))}
          </ul>
          {section.total > section.items.length && (
            <p className="border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Showing {section.items.length} of {section.total}
            </p>
          )}
        </>
      )}
    </section>
  )
}
