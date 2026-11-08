import { useState } from "react"
import { Link } from "wouter"
import type { AttentionItem, AttentionKind } from "../../shared/api.ts"
import { ShowAll } from "../charts/ShowAll.tsx"
import { IssueRef } from "../ui/IssueRef.tsx"
import { ExternalIcon } from "../ui/icons.tsx"
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

/**
 * The title and detail lines of an item. An issue or pull request names its repository in its
 * reference; a milestone or workflow names it in the title, since "v1.4" or "ci on main" can be
 * in several repositories.
 */
const ItemText = ({ item }: { readonly item: AttentionItem }) => {
  const number = item.url.match(ISSUE_URL)?.[1]
  return (
    <span className="min-w-0 flex-1">
      <span className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {item.title}
        {number === undefined && (
          <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {item.repo}</span>
        )}
      </span>
      <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="text-zinc-700 dark:text-zinc-300">{ATTENTION_LABELS[item.kind]}</span>
        {" · "}
        {number === undefined ? (
          item.detail
        ) : (
          <>
            <IssueRef repo={item.repo} number={Number(number)} /> ·{" "}
            {item.detail.replace(/^#\d+,?\s*/, "")}
          </>
        )}
      </span>
    </span>
  )
}

const LIMIT = 6

/**
 * Where an item's board card is, when it has one: an idle issue in a chosen repository opens in
 * the board's side panel, as it would from the palette or an epic.
 */
export type BoardHref = (repo: string, number: number) => string | null

const rowClass =
  "flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500 dark:hover:bg-zinc-800/60"

const Age = ({ days }: { readonly days: number }) => (
  <span
    className="shrink-0 pt-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
    title={`${days} days`}
  >
    {days}d
  </span>
)

const Row = ({
  item,
  boardHref,
}: {
  readonly item: AttentionItem
  readonly boardHref: BoardHref
}) => {
  const number = item.url.match(ISSUE_URL)?.[1]
  const onBoard =
    item.kind === "stale_issue" && number !== undefined
      ? boardHref(item.repo, Number(number))
      : null
  if (onBoard === null) {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className={rowClass}>
        <KindIcon kind={item.kind} />
        <ItemText item={item} />
        <span className="sr-only"> (opens in Forgejo)</span>
        <Age days={item.ageDays} />
        <ExternalIcon className="mt-1 size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
      </a>
    )
  }
  return (
    // Like an epic's child: the Forgejo link waits for hover or focus, so only rows that go to
    // Forgejo show a ↗ at rest.
    <div className="group/row flex items-start">
      <Link href={onBoard} className={rowClass}>
        <KindIcon kind={item.kind} />
        <ItemText item={item} />
        <Age days={item.ageDays} />
      </Link>
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${item.title} in Forgejo`}
        title="Open in Forgejo"
        className="mt-1.5 grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 opacity-0 transition group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-indigo-500 pointer-coarse:size-11 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <ExternalIcon className="size-3.5" />
      </a>
    </div>
  )
}

/** Failing CI, overdue milestones, and idle work, worst first. */
export const AttentionList = ({
  items,
  boardHref,
}: {
  readonly items: ReadonlyArray<AttentionItem>
  readonly boardHref: BoardHref
}) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="flex flex-col">
      <ul className="-mx-2 flex flex-col">
        {(expanded ? items : items.slice(0, LIMIT)).map((item) => (
          <li key={`${item.kind}-${item.url}`}>
            <Row item={item} boardHref={boardHref} />
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
