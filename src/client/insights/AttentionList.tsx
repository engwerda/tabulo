import { useState } from "react"
import type { AttentionItem, AttentionKind } from "../../shared/api.ts"
import { ShowAll } from "../charts/ShowAll.tsx"
import { IssueRef } from "../ui/IssueRef.tsx"
import { cardClass } from "../ui/primitives.tsx"
import { ATTENTION_LABELS } from "./summary.ts"

const NEUTRAL =
  "bg-zinc-50 text-zinc-600 ring-zinc-900/10 dark:bg-zinc-800/60 dark:text-zinc-300 dark:ring-white/10"

const KIND_STYLES: Record<AttentionKind, { readonly icon: string; readonly tone: string }> = {
  failing_ci: {
    icon: "M4.5 4.5l7 7m0-7l-7 7",
    tone: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-400/20",
  },
  overdue_milestone: {
    icon: "M8 4.5V8l2.5 1.5M14 8A6 6 0 112 8a6 6 0 0112 0z",
    tone: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-400/20",
  },
  stale_pull: {
    icon: "M5 3.5v9m0-9a1.5 1.5 0 100-.01M11 12.5V7a2 2 0 00-2-2H7",
    tone: NEUTRAL,
  },
  stale_issue: {
    icon: "M8 5v3.5M8 11h.01M14 8A6 6 0 112 8a6 6 0 0112 0z",
    tone: NEUTRAL,
  },
}

const KindIcon = ({ kind }: { readonly kind: AttentionKind }) => (
  <span
    className={`grid size-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${KIND_STYLES[kind].tone}`}
  >
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
      <path
        d={KIND_STYLES[kind].icon}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
)

/** The one line that stands in for the attention list when nothing needs attention. */
export const AllClear = () => (
  <section
    aria-label="Needs attention"
    className={`${cardClass} flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5`}
  >
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-400/20">
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
    <p className="min-w-0">
      <span className="font-medium text-zinc-900 dark:text-zinc-50">All clear.</span>{" "}
      <span className="text-zinc-500 dark:text-zinc-400">
        No failing CI, overdue milestones, or idle work.
      </span>
    </p>
  </section>
)

// Idle issues and pull requests link to them, and their detail starts with "#12".
const ISSUE_URL = /\/(?:issues|pulls)\/(\d+)$/

/** Where the item is: its issue reference when it is an issue or pull request, else its repository. */
const Where = ({ item }: { readonly item: AttentionItem }) => {
  const number = item.url.match(ISSUE_URL)?.[1]
  return number === undefined ? (
    <>
      {item.repo} · {item.detail}
    </>
  ) : (
    <>
      <IssueRef repo={item.repo} number={Number(number)} /> ·{" "}
      {item.detail.replace(/^#\d+,?\s*/, "")}
    </>
  )
}

const LIMIT = 6

/** Failing CI, overdue milestones, and idle work, worst first. */
export const AttentionList = ({ items }: { readonly items: ReadonlyArray<AttentionItem> }) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="flex flex-col">
      <ul className="-mx-2 flex flex-col">
        {(expanded ? items : items.slice(0, LIMIT)).map((item) => (
          <li key={`${item.kind}-${item.url}`}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500 dark:hover:bg-zinc-800/60"
            >
              <KindIcon kind={item.kind} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-900 max-md:line-clamp-2 md:truncate dark:text-zinc-100">
                  {item.title}
                </span>
                <span className="block text-xs text-zinc-500 max-md:line-clamp-2 md:truncate dark:text-zinc-400">
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {ATTENTION_LABELS[item.kind]}
                  </span>
                  {" · "}
                  <Where item={item} />
                </span>
              </span>
              <span
                className="shrink-0 pt-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
                title={`${item.ageDays} days`}
              >
                {item.ageDays}d
              </span>
            </a>
          </li>
        ))}
      </ul>
      {items.length > LIMIT && (
        <ShowAll
          total={items.length}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
        />
      )}
    </div>
  )
}
