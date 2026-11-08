import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type ReactNode,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from "react"
import type { BoardCard, BoardColumn } from "../../shared/api.ts"
import { AvatarStack } from "../Avatar.tsx"
import { absoluteTime, shortAge } from "../format.ts"
import {
  ArchiveIcon,
  CheckIcon,
  CommentIcon,
  ExternalIcon,
  IssueClosedIcon,
  LinkIcon,
  MilestoneIcon,
  PanelIcon,
  RefreshIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "../ui/icons.tsx"
import { LabelList } from "../ui/LabelChip.tsx"
import { Popover, touchTarget } from "../ui/primitives.tsx"
import { useRepoColor } from "../ui/repo-palette.tsx"

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

export const RepoTag = ({ repo }: { repo: string }) => {
  const color = useRepoColor(repo)
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{repo}</span>
    </span>
  )
}

const menuItemClass =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"

const CardMenu = ({
  card,
  columns,
  movable,
  assigned,
  actions,
  open,
  onOpenChange,
  returnFocus,
}: {
  card: BoardCard
  columns: ReadonlyArray<BoardColumn>
  movable: boolean
  assigned: boolean
  actions: CardActions
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The card's link, which keeps the keyboard where the menu was opened from. */
  returnFocus: RefObject<HTMLElement | null>
}) => (
  <Popover
    align="end"
    chevron={false}
    focusFirstItem
    open={open}
    onOpenChange={onOpenChange}
    returnFocus={returnFocus}
    accessibleLabel={`Actions for ${card.repo}#${card.number}`}
    triggerClass={`-my-0.5 inline-flex size-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${touchTarget}`}
    triggerTabIndex={-1}
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
        <button
          type="button"
          role="menuitem"
          className={menuItemClass}
          onClick={() => {
            close()
            actions.open(card)
          }}
        >
          <PanelIcon className="size-4 text-zinc-400" />
          Open details
        </button>
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
        {movable && (
          <>
            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
            <p className="px-2 pt-1 pb-1 text-2xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Move to
            </p>
            {columns.map((column) => {
              const here = column.key === card.column
              return (
                <button
                  key={column.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={here}
                  className={menuItemClass}
                  onClick={() => {
                    close()
                    if (!here) actions.moveTo(card, column.key)
                  }}
                >
                  <ColumnDot column={column} />
                  <span className="flex-1 truncate">{column.title}</span>
                  {here && <CheckIcon className="size-4 text-indigo-600 dark:text-indigo-400" />}
                </button>
              )
            })}
          </>
        )}
      </div>
    )}
  </Popover>
)

/** A column's mark, always in the same 16px box so lists of columns line up. */
export const ColumnDot = ({ column }: { column: BoardColumn }) => (
  <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
    <ColumnMark column={column} />
  </span>
)

const ColumnMark = ({ column }: { column: BoardColumn }) => {
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

/** Repository and number: what names the issue on its card. The Done column says it is closed. */
const CardReference = ({ card, showRepo }: { card: BoardCard; showRepo: boolean }) => (
  <>
    {card.state === "closed" && <span className="sr-only">Closed, </span>}
    {showRepo && <RepoTag repo={card.repo} />}
    <span className="shrink-0 tabular-nums">#{card.number}</span>
  </>
)

const CARD_LINK = "a[data-card-link]"

/**
 * Arrow keys move focus between cards: up and down within a column, left and right to the card
 * at the same height in the next column that has cards. Home and End go to a column's ends.
 */
const focusNeighbour = (link: HTMLElement, key: string) => {
  const column = link.closest("section")
  const board = column?.parentElement
  if (column == null || board == null) return false
  const links = [...column.querySelectorAll<HTMLElement>(CARD_LINK)]
  const index = links.indexOf(link)
  if (key === "Home" || key === "End") {
    const target = key === "Home" ? links[0] : links.at(-1)
    target?.focus()
    return target !== undefined
  }
  if (key === "ArrowDown" || key === "ArrowUp") {
    const target = links[index + (key === "ArrowDown" ? 1 : -1)]
    target?.focus()
    return target !== undefined
  }
  const columns = [...board.querySelectorAll<HTMLElement>(":scope > section")]
  const step = key === "ArrowRight" ? 1 : -1
  for (let at = columns.indexOf(column) + step; at >= 0 && at < columns.length; at += step) {
    const targets = [...(columns[at]?.querySelectorAll<HTMLElement>(CARD_LINK) ?? [])]
    const target = targets[Math.min(index, targets.length - 1)]
    if (target !== undefined) {
      target.focus()
      target.scrollIntoView({ block: "nearest", inline: "nearest" })
      return true
    }
  }
  return false
}

/**
 * The card's face, shared by the sortable card and the drag overlay: the issue's reference and
 * assignees, its title, then one quiet line of labels, milestone, comments, and age.
 */
const CardFace = ({
  card,
  reference,
  tools,
}: {
  card: BoardCard
  reference: ReactNode
  /** Controls beside the assignees, such as the card's menu. */
  tools?: ReactNode
}) => {
  const closed = card.state === "closed"
  const age = closed && card.closedAt !== null ? card.closedAt : card.updatedAt
  return (
    <>
      <div className="flex h-5 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {reference}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {tools}
          {card.assignees.length > 0 && <AvatarStack people={card.assignees} size="xs" />}
        </span>
      </div>
      <p
        className={`mt-1 text-sm leading-5 font-medium break-words ${
          closed ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {card.title}
      </p>
      {/* On a narrow card the details wrap under the labels as one group, with the age. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <LabelList labels={card.labels} max={2} compact />
        <span className="ml-auto flex shrink-0 items-center gap-2.5">
          {card.milestone !== null && (
            <span title={`Milestone ${card.milestone}`} className="flex items-center gap-1">
              <MilestoneIcon className="size-3.5 shrink-0" />
              <span className="sr-only">Milestone </span>
              <span className="max-w-20 truncate">{card.milestone}</span>
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
          <time
            dateTime={age}
            title={`${closed ? "Closed" : "Updated"} ${absoluteTime(age)}`}
            className="tabular-nums"
          >
            <span className="sr-only">{closed ? "Closed " : "Updated "}</span>
            {shortAge(age)}
          </time>
        </span>
      </div>
    </>
  )
}

const cardBase =
  "group/card relative rounded-xl border bg-white p-2.5 select-none [-webkit-touch-callout:none] dark:bg-zinc-900"

type SortableCardProps = {
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly viewerCanArrange: boolean
  readonly viewer: string
  readonly showRepo: boolean
  readonly selected: boolean
  readonly actions: CardActions
  /** The board's query string without the search text, which the card's link keeps. */
  readonly hrefBase: string
  /**
   * Whether Tab stops at this card. Only a column's first card is a Tab stop, so Tab moves from
   * column to column and the arrow keys move between the cards inside one.
   */
  readonly tabbable: boolean
  /** Forgejo has not confirmed this card's move yet. */
  readonly saving: boolean
}

type CardContentsProps = {
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly movable: boolean
  readonly assigned: boolean
  readonly showRepo: boolean
  readonly actions: CardActions
  readonly href: string
  readonly dragging: boolean
  readonly tabbable: boolean
  readonly saving: boolean
  /** dnd-kit's keyboard activation, which the card's link carries. */
  readonly keyboard: {
    readonly ref: (element: HTMLElement | null) => void
    readonly describedBy: string | undefined
    readonly onKeyDown: ((event: KeyboardEvent) => void) | undefined
  }
}

/**
 * Everything inside a card. dnd-kit re-renders every sortable card on each pointer move, so
 * this part is memoized and only the outer list item follows the drag.
 *
 * The link is the card's one Tab stop: Enter opens the details, Space picks the card up, arrow
 * keys move between cards, and the period or the context menu key opens the card's menu.
 */
const CardContents = memo(function CardContents({
  card,
  columns,
  movable,
  assigned,
  showRepo,
  actions,
  href,
  dragging,
  tabbable,
  saving,
  keyboard,
}: CardContentsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const link = useRef<HTMLAnchorElement | null>(null)
  const openPanel = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    actions.open(card)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (dragging) return
    if (
      event.key === "." ||
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault()
      setMenuOpen(true)
      return
    }
    if (
      (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      if (focusNeighbour(event.currentTarget, event.key)) event.preventDefault()
      return
    }
    if (movable) keyboard.onKeyDown?.(event)
  }
  return (
    <CardFace
      card={card}
      reference={
        <>
          <a
            ref={(element) => {
              link.current = element
              if (movable) keyboard.ref(element)
            }}
            href={href}
            data-card-link=""
            tabIndex={tabbable ? 0 : -1}
            onClick={openPanel}
            onKeyDown={onKeyDown}
            draggable={false}
            aria-describedby={movable ? keyboard.describedBy : undefined}
            aria-keyshortcuts="Enter Space ."
            className="flex min-w-0 items-center gap-1.5 rounded font-medium text-zinc-500 hover:text-zinc-800 focus-visible:outline-none dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <span className="sr-only">{card.title}, </span>
            {!showRepo && <span className="sr-only">{card.repo}</span>}
            <CardReference card={card} showRepo={showRepo} />
          </a>
          {saving && (
            <span title="Saving to Forgejo" className="flex shrink-0 items-center gap-1 text-2xs">
              <RefreshIcon className="size-3 animate-spin" />
              Saving
            </span>
          )}
          {card.readOnlyReason === "archived" && (
            <span
              title={`${card.repo} is archived, so this card cannot be moved.`}
              className="shrink-0"
            >
              <ArchiveIcon className="size-3.5" />
              <span className="sr-only">Archived</span>
            </span>
          )}
        </>
      }
      tools={
        // The menu shows on hover or focus where a pointer can hover, and always on touch.
        <span
          className={`relative z-10 flex transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
        >
          <CardMenu
            card={card}
            columns={columns}
            movable={movable}
            assigned={assigned}
            actions={actions}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            returnFocus={link}
          />
        </span>
      }
    />
  )
})

/** Clicks on these inside a card do their own thing instead of opening the details. */
const OWN_CLICK = "a, button, input, select, textarea, [role='menu']"

export const SortableCard = memo(function SortableCard({
  card,
  columns,
  viewerCanArrange,
  viewer,
  showRepo,
  selected,
  actions,
  hrefBase,
  tabbable,
  saving,
}: SortableCardProps) {
  const movable = viewerCanArrange && card.readOnlyReason === null
  const sortable = useSortable({ id: card.key, disabled: !movable })
  const { listeners, attributes, setActivatorNodeRef } = sortable
  // The whole card drags with a mouse or a long press; only the link starts a keyboard drag.
  const [pointerListeners, keyboard] = useMemo(() => {
    const entries = Object.entries(listeners ?? {})
    return [
      Object.fromEntries(entries.filter(([name]) => name !== "onKeyDown")),
      {
        ref: setActivatorNodeRef,
        describedBy: attributes["aria-describedby"],
        onKeyDown: listeners?.onKeyDown as ((event: KeyboardEvent) => void) | undefined,
      },
    ] as const
  }, [listeners, attributes, setActivatorNodeRef])
  const assigned = card.assignees.some((assignee) => assignee.login === viewer)
  const href = `?${hrefBase}${hrefBase === "" ? "" : "&"}card=${encodeURIComponent(`${card.repo}#${card.number}`)}`
  const openFromCard = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest(OWN_CLICK) !== null) return
    if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener")
    else actions.open(card)
  }
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the card's link is its keyboard entry point
    <li
      ref={sortable.setNodeRef}
      data-card-key={card.key}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      {...(movable ? pointerListeners : {})}
      onClick={openFromCard}
      className={`${cardBase} cursor-pointer transition-[border-color,box-shadow,opacity] has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-indigo-500 ${
        sortable.isDragging
          ? "border-dashed border-indigo-300 bg-indigo-50/60 shadow-none dark:border-indigo-400/40 dark:bg-indigo-500/[0.06] [&>*]:invisible"
          : selected
            ? "border-indigo-400 shadow-card ring-3 ring-indigo-500/15 dark:border-indigo-500"
            : "border-zinc-200/90 shadow-card hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-900/5 dark:border-zinc-800 dark:hover:border-zinc-700"
      }`}
    >
      <CardContents
        card={card}
        columns={columns}
        movable={movable}
        assigned={assigned}
        showRepo={showRepo}
        actions={actions}
        href={href}
        dragging={sortable.isDragging}
        tabbable={tabbable}
        saving={saving}
        keyboard={keyboard}
      />
    </li>
  )
})

// dnd-kit measures the overlay's only child for collisions and keyboard moves, so the tilt sits
// one level down: a rotated box is wider than the card and would shift every comparison.
export const OverlayCard = ({ card, showRepo }: { card: BoardCard; showRepo: boolean }) => (
  <div>
    <div
      className={`${cardBase} rotate-1 cursor-grabbing border-zinc-200 shadow-lift ring-1 ring-zinc-900/5 dark:border-zinc-700 dark:bg-zinc-800 dark:ring-white/5`}
    >
      <CardFace
        card={card}
        reference={
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            <CardReference card={card} showRepo={showRepo} />
          </span>
        }
      />
    </div>
  </div>
)
