import type { ReactNode } from "react"
import type { Section } from "../shared/api.ts"
import { AlertIcon, CheckIcon } from "./ui/icons.tsx"
import { buttonClass, cardClass } from "./ui/primitives.tsx"

type SectionCardProps<A> = {
  readonly id: string
  readonly title: string
  readonly icon: ReactNode
  /** A few words for the header when the section is empty, such as "None waiting". */
  readonly empty: string
  readonly section: Section<A>
  readonly itemKey: (item: A) => string | number
  readonly renderItem: (item: A) => ReactNode
  readonly onRetry: () => void
  readonly retrying: boolean
}

/** A titled list of rows. An empty section is a single line, so it costs the page one row. */
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
  const isEmpty = section._tag === "Loaded" && section.items.length === 0
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`${cardClass} min-w-0 scroll-mt-20 overflow-hidden`}
    >
      <header
        className={`flex h-11 items-center gap-2.5 px-4 ${isEmpty ? "" : "border-b border-zinc-100 dark:border-zinc-800"}`}
      >
        <span aria-hidden="true" className="flex text-zinc-400 dark:text-zinc-500">
          {icon}
        </span>
        <h2 id={headingId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {section._tag === "Loaded" &&
          (isEmpty ? (
            <p className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <CheckIcon className="size-3.5 text-zinc-400 dark:text-zinc-500" />
              {empty}
            </p>
          ) : (
            <span className="ml-auto min-w-5 rounded-full bg-zinc-100 px-1.5 text-center text-xs leading-5 font-medium text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-300">
              {section.total}
            </span>
          ))}
      </header>
      {section._tag === "Failed" ? (
        <div role="alert" className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <AlertIcon className="size-4 text-red-600 dark:text-red-400" />
          <p className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300">
            Could not load this section.{" "}
            <span className="text-zinc-500 dark:text-zinc-400">{section.message}</span>
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className={`${buttonClass.secondary} shrink-0`}
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : (
        !isEmpty && (
          <>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {section.items.map((item) => (
                <li key={itemKey(item)}>{renderItem(item)}</li>
              ))}
            </ul>
            {section.total > section.items.length && (
              <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 tabular-nums dark:border-zinc-800 dark:text-zinc-400">
                Showing {section.items.length} of {section.total}
              </p>
            )}
          </>
        )
      )}
    </section>
  )
}
