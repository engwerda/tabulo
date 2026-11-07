import { useQuery } from "@tanstack/react-query"
import DOMPurify from "dompurify"
import { type ReactNode, useEffect, useRef } from "react"
import type { BoardCard, BoardColumn } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { fetchCardDetail } from "../api.ts"
import { absoluteTime, relativeTime } from "../format.ts"
import {
  ChevronDownIcon,
  CommentIcon,
  ExternalIcon,
  IssueClosedIcon,
  IssueOpenIcon,
  LinkIcon,
  LockIcon,
  UserMinusIcon,
  UserPlusIcon,
  XIcon,
} from "../ui/icons.tsx"
import { LabelList } from "../ui/LabelChip.tsx"
import { buttonClass, Kbd } from "../ui/primitives.tsx"
import { ColumnDot, RepoTag } from "./BoardCardView.tsx"

/** Forgejo already sanitizes rendered Markdown; this keeps Tabulo safe if it ever does not. */
const sanitize = (html: string) => {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  const template = document.createElement("template")
  template.innerHTML = clean
  for (const link of template.content.querySelectorAll("a[href]")) {
    link.setAttribute("target", "_blank")
    link.setAttribute("rel", "noreferrer")
  }
  for (const box of template.content.querySelectorAll("input")) box.setAttribute("disabled", "")
  return template.innerHTML
}

const Property = ({ name, children }: { name: string; children: ReactNode }) => (
  <>
    <dt className="pt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{name}</dt>
    <dd className="min-w-0 text-sm text-zinc-800 dark:text-zinc-200">{children}</dd>
  </>
)

type CardPanelProps = {
  readonly org: string
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly viewer: string
  readonly movable: boolean
  /** Position among the shown cards of its column, for the previous and next buttons. */
  readonly position: { readonly index: number; readonly count: number }
  readonly onStep: (step: -1 | 1) => void
  readonly onMoveTo: (column: string) => void
  readonly onToggleAssigned: () => void
  readonly assigning: boolean
  readonly onCopyLink: () => void
  readonly onClose: () => void
}

export const CardPanel = ({
  org,
  card,
  columns,
  viewer,
  movable,
  position,
  onStep,
  onMoveTo,
  onToggleAssigned,
  assigning,
  onCopyLink,
  onClose,
}: CardPanelProps) => {
  const detail = useQuery({
    queryKey: ["card-detail", org, card.repo, card.number],
    queryFn: () => fetchCardDetail(org, card.repo, card.number),
    staleTime: 30_000,
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const panel = useRef<HTMLElement>(null)
  const column = columns.find((candidate) => candidate.key === card.column)
  const assigned = card.assignees.some((assignee) => assignee.login === viewer)
  const closed = card.state === "closed"

  // Focus the heading when the panel opens or shows another card, so screen readers announce it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again for each card shown
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [card.key])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <aside
      ref={panel}
      aria-label={`${card.repo}#${card.number} details`}
      className="fixed inset-y-0 right-0 z-40 flex w-full animate-slide-in flex-col border-l border-zinc-200 bg-white shadow-pop sm:w-[30rem] dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-zinc-100 px-3 dark:border-zinc-800/80">
        <span className="flex min-w-0 items-center gap-2 pl-1 text-sm text-zinc-500 dark:text-zinc-400">
          <RepoTag repo={card.repo} />
          <span className="font-medium tabular-nums">#{card.number}</span>
        </span>
        <span className="ml-auto flex items-center">
          <span className="mr-1 hidden text-xs text-zinc-400 tabular-nums sm:inline">
            {position.count > 0 && `${position.index + 1} of ${position.count}`}
          </span>
          <button
            type="button"
            onClick={() => onStep(-1)}
            disabled={position.index <= 0}
            aria-label="Previous card in the column"
            title="Previous card (K)"
            className={buttonClass.icon}
          >
            <ChevronDownIcon className="size-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={position.index >= position.count - 1}
            aria-label="Next card in the column"
            title="Next card (J)"
            className={buttonClass.icon}
          >
            <ChevronDownIcon className="size-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
          <button
            type="button"
            onClick={onCopyLink}
            aria-label="Copy issue link"
            title="Copy issue link"
            className={buttonClass.icon}
          >
            <LinkIcon />
          </button>
          <a
            href={card.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in Forgejo"
            title="Open in Forgejo (O)"
            className={buttonClass.icon}
          >
            <ExternalIcon />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            title="Close (Esc)"
            className={buttonClass.icon}
          >
            <XIcon />
          </button>
        </span>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 pt-5 pb-6">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              closed
                ? "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
            }`}
          >
            {closed ? (
              <IssueClosedIcon className="size-3.5" />
            ) : (
              <IssueOpenIcon className="size-3.5" />
            )}
            {closed ? "Closed" : "Open"}
          </span>
          <h2
            ref={heading}
            tabIndex={-1}
            className="mt-3 text-xl leading-7 font-semibold tracking-tight text-balance break-words text-zinc-900 focus:outline-none dark:text-zinc-50"
          >
            {card.title}
          </h2>

          <dl className="mt-6 grid grid-cols-[6.5rem_1fr] items-start gap-x-4 gap-y-3.5">
            <Property name="Status">
              {movable ? (
                <label className="relative inline-flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 py-1 pr-7 pl-2.5 transition hover:border-zinc-300 has-focus-visible:outline-2 has-focus-visible:outline-indigo-500 dark:border-zinc-800 dark:hover:border-zinc-700">
                  {column !== undefined && <ColumnDot column={column} />}
                  <span className="truncate font-medium">{column?.title ?? card.column}</span>
                  <ChevronDownIcon className="absolute right-2 size-3.5 text-zinc-400" />
                  <select
                    aria-label="Move to column"
                    value={card.column}
                    onChange={(event) => onMoveTo(event.target.value)}
                    className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                  >
                    {columns.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="inline-flex items-center gap-2 py-1 font-medium">
                  {column !== undefined && <ColumnDot column={column} />}
                  {column?.title ?? card.column}
                  {card.readOnlyReason === "archived" && (
                    <span className="flex items-center gap-1 text-xs font-normal text-zinc-500">
                      <LockIcon className="size-3" /> archived repository
                    </span>
                  )}
                </span>
              )}
            </Property>
            <Property name="Assignees">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-0.5">
                {card.assignees.length === 0 && (
                  <span className="text-zinc-500 dark:text-zinc-400">Nobody</span>
                )}
                {card.assignees.map((assignee) => (
                  <span key={assignee.login} className="flex items-center gap-1.5">
                    <Avatar url={assignee.avatarUrl} name={assignee.login} size="xs" />
                    {assignee.login}
                  </span>
                ))}
                {!closed && card.readOnlyReason === null && (
                  <button
                    type="button"
                    onClick={onToggleAssigned}
                    disabled={assigning}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                  >
                    {assigned ? (
                      <UserMinusIcon className="size-3.5" />
                    ) : (
                      <UserPlusIcon className="size-3.5" />
                    )}
                    {assigned ? "Unassign me" : "Assign me"}
                  </button>
                )}
              </div>
            </Property>
            <Property name="Labels">
              {card.labels.length === 0 ? (
                <span className="block py-0.5 text-zinc-500 dark:text-zinc-400">None</span>
              ) : (
                <LabelList labels={card.labels} size="md" className="py-0.5" />
              )}
            </Property>
            <Property name="Milestone">
              <span className="block py-0.5">
                {card.milestone ?? <span className="text-zinc-500 dark:text-zinc-400">None</span>}
              </span>
            </Property>
            <Property name="Opened">
              <span className="flex flex-wrap items-center gap-1.5 py-0.5">
                <Avatar url={card.author.avatarUrl} name={card.author.login} size="xs" />
                {card.author.login}
                <time
                  dateTime={card.createdAt}
                  title={absoluteTime(card.createdAt)}
                  className="text-zinc-500 dark:text-zinc-400"
                >
                  {relativeTime(card.createdAt)}
                </time>
              </span>
            </Property>
            <Property name={closed ? "Closed" : "Updated"}>
              {(() => {
                const at = closed && card.closedAt !== null ? card.closedAt : card.updatedAt
                return (
                  <time dateTime={at} title={absoluteTime(at)} className="block py-0.5">
                    {relativeTime(at)}
                  </time>
                )
              })()}
            </Property>
          </dl>

          <section aria-labelledby="card-description" className="mt-8">
            <h3
              id="card-description"
              className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"
            >
              Description
            </h3>
            <div className="mt-3">
              {detail.data !== undefined ? (
                detail.data.bodyHtml.trim() === "" ? (
                  <p className="text-sm text-zinc-500 italic dark:text-zinc-400">
                    No description provided.
                  </p>
                ) : (
                  <div
                    className="prose-forgejo"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: Forgejo-rendered Markdown, sanitized again with DOMPurify
                    dangerouslySetInnerHTML={{ __html: sanitize(detail.data.bodyHtml) }}
                  />
                )
              ) : detail.isError ? (
                <div role="alert" className="text-sm text-red-700 dark:text-red-400">
                  Could not load the description: {detail.error.message}{" "}
                  <button
                    type="button"
                    onClick={() => void detail.refetch()}
                    className="font-medium underline"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-2" aria-hidden="true">
                  {["w-11/12", "w-full", "w-3/4", "w-5/6"].map((width) => (
                    <div
                      key={width}
                      className={`h-3.5 animate-shimmer rounded bg-zinc-200 dark:bg-zinc-800 ${width}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-zinc-100 px-6 py-3 dark:border-zinc-800/80">
        <a href={card.url} target="_blank" rel="noreferrer" className={buttonClass.secondary}>
          <CommentIcon className="size-4 text-zinc-400" />
          {card.comments === 0
            ? "Comment in Forgejo"
            : `${card.comments} ${card.comments === 1 ? "comment" : "comments"} in Forgejo`}
        </a>
        <span className="ml-auto hidden items-center gap-1 text-xs text-zinc-400 sm:flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> to browse
        </span>
      </div>
    </aside>
  )
}
