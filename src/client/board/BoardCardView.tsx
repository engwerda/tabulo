import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { type MouseEvent, memo, useMemo } from "react"
import type { BoardCard, BoardColumn } from "../../shared/api.ts"
import { AvatarStack } from "../Avatar.tsx"
import { absoluteTime, repoColor, shortAge } from "../format.ts"
import {
  CommentIcon,
  ExternalIcon,
  GripIcon,
  IssueClosedIcon,
  LinkIcon,
  LockIcon,
  MilestoneIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "../ui/icons.tsx"
import { LabelList } from "../ui/LabelChip.tsx"
import { buttonClass, Popover } from "../ui/primitives.tsx"

/**
 * What a card can do besides being dragged. Cards are memoized, so the board passes one object
 * that keeps its identity across renders.
 */
export type CardActions = {
  readonly open: (card: BoardCard) => void
  readonly moveTo: (card: BoardCard, column: string) => void
  readonly toggleAssigned: (card: BoardCard) => void
  readonly copyLink: (card: BoardCard) => void
}

export const RepoTag = ({ repo }: { repo: string }) => (
  <span className="flex min-w-0 items-center gap-1.5">
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-[3px]"
      style={{ backgroundColor: repoColor(repo) }}
    />
    <span className="truncate">{repo}</span>
  </span>
)

const menuItemClass =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"

const CardMenu = ({
  card,
  columns,
  movable,
  assigned,
  actions,
}: {
  card: BoardCard
  columns: ReadonlyArray<BoardColumn>
  movable: boolean
  assigned: boolean
  actions: CardActions
}) => (
  <Popover
    strategy="fixed"
    align="end"
    chevron={false}
    accessibleLabel={`Actions for ${card.repo}#${card.number}`}
    triggerClass={`${buttonClass.iconSmall} relative z-10`}
    panelClass="w-56 p-1"
    label={
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
        <circle cx="3.5" cy="8" r="1.25" />
        <circle cx="8" cy="8" r="1.25" />
        <circle cx="12.5" cy="8" r="1.25" />
      </svg>
    }
  >
    {(close) => (
      <div role="menu" aria-label={`Actions for ${card.repo}#${card.number}`}>
        {movable && (
          <>
            <p className="px-2 pt-1.5 pb-1 text-[0.6875rem] font-semibold tracking-wide text-zinc-400 uppercase">
              Move to
            </p>
            {columns
              .filter((column) => column.key !== card.column)
              .map((column) => (
                <button
                  key={column.key}
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    close()
                    actions.moveTo(card, column.key)
                  }}
                >
                  <ColumnDot column={column} />
                  <span className="truncate">{column.title}</span>
                </button>
              ))}
            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
          </>
        )}
        {card.state === "open" && card.readOnlyReason === null && (
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              close()
              actions.toggleAssigned(card)
            }}
          >
            {assigned ? (
              <UserMinusIcon className="size-4 text-zinc-400" />
            ) : (
              <UserPlusIcon className="size-4 text-zinc-400" />
            )}
            {assigned ? "Unassign me" : "Assign to me"}
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            close()
            actions.copyLink(card)
          }}
        >
          <LinkIcon className="size-4 text-zinc-400" />
          Copy issue link
        </button>
        <a
          role="menuitem"
          href={card.url}
          target="_blank"
          rel="noreferrer"
          className={menuItemClass}
          onClick={close}
        >
          <ExternalIcon className="size-4 text-zinc-400" />
          Open in Forgejo
        </a>
      </div>
    )}
  </Popover>
)

export const ColumnDot = ({ column }: { column: BoardColumn }) => {
  if (column._tag === "Status") {
    return (
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full ring-2 ring-[color-mix(in_oklab,var(--dot)_25%,transparent)]"
        style={{ backgroundColor: column.label.color, "--dot": column.label.color } as never}
      />
    )
  }
  if (column._tag === "Done") {
    return (
      <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">
        <IssueClosedIcon className="size-3.5" />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full border-[1.5px] border-dashed border-zinc-400 dark:border-zinc-500"
    />
  )
}

/** Repository and number: what names the issue on its card. */
const CardReference = ({ card, showRepo }: { card: BoardCard; showRepo: boolean }) => (
  <>
    {card.state === "closed" && (
      <span className="text-emerald-600 dark:text-emerald-400" title="Closed">
        <IssueClosedIcon className="size-3.5" />
        <span className="sr-only">Closed, </span>
      </span>
    )}
    {showRepo && <RepoTag repo={card.repo} />}
    <span className="shrink-0 tabular-nums">#{card.number}</span>
  </>
)

/** The card's face: shared by the sortable card and the drag overlay. */
const CardFace = ({ card }: { card: BoardCard }) => {
  const closed = card.state === "closed"
  const age = closed && card.closedAt !== null ? card.closedAt : card.updatedAt
  return (
    <>
      <p
        className={`text-[0.8125rem] leading-5 font-medium break-words ${
          closed ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {card.title}
      </p>
      <LabelList labels={card.labels} className="mt-2" />
      <div className="mt-2.5 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        {card.milestone !== null && (
          <span title={`Milestone ${card.milestone}`} className="flex min-w-0 items-center gap-1">
            <MilestoneIcon className="size-3.5" />
            <span className="sr-only">Milestone </span>
            <span className="truncate">{card.milestone}</span>
          </span>
        )}
        {card.comments > 0 && (
          <span
            title={`${card.comments} ${card.comments === 1 ? "comment" : "comments"}`}
            className="flex items-center gap-1 tabular-nums"
          >
            <CommentIcon className="size-3.5" />
            {card.comments}
            <span className="sr-only">{card.comments === 1 ? " comment" : " comments"}</span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <time
            dateTime={age}
            title={`${closed ? "Closed" : "Updated"} ${absoluteTime(age)}`}
            className="tabular-nums"
          >
            <span className="sr-only">{closed ? "Closed " : "Updated "}</span>
            {shortAge(age)}
          </time>
          {card.assignees.length > 0 && <AvatarStack people={card.assignees} size="xs" />}
        </span>
      </div>
    </>
  )
}

const cardBase =
  "group/card relative rounded-xl border bg-white p-3 select-none [-webkit-touch-callout:none] dark:bg-zinc-900"

type SortableCardProps = {
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly viewerCanArrange: boolean
  readonly viewer: string
  readonly showRepo: boolean
  readonly selected: boolean
  readonly actions: CardActions
  /** The board's query string without the search text, which the title link keeps. */
  readonly hrefBase: string
}

type CardContentsProps = {
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly movable: boolean
  readonly assigned: boolean
  readonly showRepo: boolean
  readonly actions: CardActions
  readonly href: string
  readonly handle: {
    readonly ref: (element: HTMLElement | null) => void
    readonly attributes: object
    readonly listeners: object
  }
}

/**
 * Everything inside a card. dnd-kit re-renders every sortable card on each pointer move, so
 * this part is memoized and only the outer list item follows the drag.
 */
const CardContents = memo(function CardContents({
  card,
  columns,
  movable,
  assigned,
  showRepo,
  actions,
  href,
  handle,
}: CardContentsProps) {
  const openPanel = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    actions.open(card)
  }
  return (
    <>
      <div className="flex h-5 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <a
          href={href}
          onClick={openPanel}
          draggable={false}
          className="flex min-w-0 items-center gap-1.5 rounded font-medium text-zinc-500 after:absolute after:inset-0 after:rounded-xl hover:text-zinc-800 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <span className="sr-only">{card.title}, </span>
          {!showRepo && <span className="sr-only">{card.repo}</span>}
          <CardReference card={card} showRepo={showRepo} />
        </a>
        {card.readOnlyReason === "archived" && (
          <span
            title={`${card.repo} is archived, so this card cannot be moved.`}
            className="flex items-center gap-1 rounded bg-zinc-100 px-1 py-px text-[0.625rem] font-medium tracking-wide text-zinc-500 uppercase dark:bg-zinc-800 dark:text-zinc-400"
          >
            <LockIcon className="size-3" />
            Archived
          </span>
        )}
        <span className="relative z-10 -my-1 -mr-1.5 ml-auto flex items-center opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100">
          <CardMenu
            card={card}
            columns={columns}
            movable={movable}
            assigned={assigned}
            actions={actions}
          />
          {movable && (
            <button
              type="button"
              ref={handle.ref}
              {...handle.attributes}
              {...handle.listeners}
              aria-label={`Move ${card.repo}#${card.number} with the keyboard`}
              title="Drag to move, or press Space to pick up"
              className={`${buttonClass.iconSmall} cursor-grab touch-none`}
            >
              <GripIcon />
            </button>
          )}
        </span>
      </div>
      <div className="mt-1">
        <CardFace card={card} />
      </div>
    </>
  )
})

export const SortableCard = memo(function SortableCard({
  card,
  columns,
  viewerCanArrange,
  viewer,
  showRepo,
  selected,
  actions,
  hrefBase,
}: SortableCardProps) {
  const movable = viewerCanArrange && card.readOnlyReason === null
  const sortable = useSortable({ id: card.key, disabled: !movable })
  const { listeners, attributes, setActivatorNodeRef } = sortable
  // The whole card drags with a mouse or a long press; only the handle starts a keyboard drag.
  const [pointerListeners, handle] = useMemo(() => {
    const entries = Object.entries(listeners ?? {})
    return [
      Object.fromEntries(entries.filter(([name]) => name !== "onKeyDown")),
      {
        ref: setActivatorNodeRef,
        attributes,
        listeners: Object.fromEntries(entries.filter(([name]) => name === "onKeyDown")),
      },
    ] as const
  }, [listeners, attributes, setActivatorNodeRef])
  const assigned = card.assignees.some((assignee) => assignee.login === viewer)
  const href = `?${hrefBase}${hrefBase === "" ? "" : "&"}card=${encodeURIComponent(`${card.repo}#${card.number}`)}`
  return (
    <li
      ref={sortable.setNodeRef}
      data-card-key={card.key}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      {...(movable ? pointerListeners : {})}
      className={`${cardBase} transition-[border-color,box-shadow,opacity] ${
        sortable.isDragging
          ? "border-dashed border-zinc-300 bg-zinc-50 opacity-50 shadow-none dark:border-zinc-700 dark:bg-zinc-900/40 [&>*]:invisible"
          : selected
            ? "border-indigo-400 shadow-card ring-3 ring-indigo-500/15 dark:border-indigo-500"
            : "border-zinc-200/90 shadow-card hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-900/5 dark:border-zinc-800 dark:hover:border-zinc-700"
      } ${movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      <CardContents
        card={card}
        columns={columns}
        movable={movable}
        assigned={assigned}
        showRepo={showRepo}
        actions={actions}
        href={href}
        handle={handle}
      />
    </li>
  )
})

// dnd-kit measures the overlay's only child for collisions and keyboard moves, so the tilt sits
// one level down: a rotated box is wider than the card and would shift every comparison.
export const OverlayCard = ({ card, showRepo }: { card: BoardCard; showRepo: boolean }) => (
  <div>
    <div
      className={`${cardBase} rotate-[1.5deg] cursor-grabbing border-indigo-300 shadow-lift ring-1 ring-indigo-500/20 dark:border-indigo-500/60`}
    >
      <div className="flex h-5 items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <CardReference card={card} showRepo={showRepo} />
        <span className="ml-auto text-zinc-400">
          <GripIcon />
        </span>
      </div>
      <div className="mt-1">
        <CardFace card={card} />
      </div>
    </div>
  </div>
)
