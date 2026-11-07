import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { BoardCard, BoardColumn } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { LabelChips } from "../rows.tsx"

const iconButtonClass =
  "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"

const GripIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
    {[3, 8, 13].flatMap((y) =>
      [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />),
    )}
  </svg>
)

const ColumnsIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="1.75" y="2.75" width="3.5" height="10.5" rx="1" />
    <rect x="6.25" y="2.75" width="3.5" height="7" rx="1" />
    <rect x="10.75" y="2.75" width="3.5" height="9" rx="1" />
  </svg>
)

const MilestoneIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    className="size-3.5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M8 1.75v12.5M3 4h8.5l2 2-2 2H3z" strokeLinejoin="round" />
  </svg>
)

/** A native select drawn as an icon button, so it stays keyboard and touch friendly. */
const MoveMenu = ({
  card,
  columns,
  onMoveTo,
}: {
  card: BoardCard
  columns: ReadonlyArray<BoardColumn>
  onMoveTo: (column: string) => void
}) => (
  <span className={`${iconButtonClass} focus-within:outline-2 focus-within:outline-indigo-500`}>
    <ColumnsIcon />
    <select
      aria-label={`Move ${card.key} to another column`}
      title="Move to another column"
      value=""
      onChange={(event) => onMoveTo(event.target.value)}
      className="absolute inset-0 cursor-pointer appearance-none opacity-0"
    >
      <option value="" disabled>
        Move to…
      </option>
      {columns
        .filter((column) => column.key !== card.column)
        .map((column) => (
          <option key={column.key} value={column.key}>
            {column.title}
          </option>
        ))}
    </select>
  </span>
)

/** The card's content below its header. The drag overlay shows it too. */
const CardContent = ({ card }: { card: BoardCard }) => (
  <>
    <p className="mt-0.5 break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">
      {card.title}
    </p>
    <LabelChips labels={card.labels} />
    {(card.milestone !== null || card.assignees.length > 0) && (
      <div className="mt-2 flex items-center justify-between gap-2">
        {card.milestone === null ? (
          <span />
        ) : (
          <span
            title={`Milestone ${card.milestone}`}
            className="flex min-w-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"
          >
            <MilestoneIcon />
            <span className="sr-only">Milestone </span>
            <span className="truncate">{card.milestone}</span>
          </span>
        )}
        {card.assignees.length > 0 && (
          <ul className="flex shrink-0 -space-x-1.5" aria-label="Assignees">
            {card.assignees.map((assignee) => (
              <li key={assignee.login} title={assignee.login}>
                <span className="sr-only">{assignee.login}</span>
                <Avatar url={assignee.avatarUrl} name={assignee.login} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
  </>
)

const cardClass =
  "group rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"

const IssueLink = ({ card }: { card: BoardCard }) => (
  <a
    href={card.url}
    className={`min-w-0 truncate rounded-sm text-xs font-medium text-zinc-500 hover:text-indigo-700 dark:text-zinc-400 dark:hover:text-indigo-300 ${focusRing}`}
  >
    {card.repo}#{card.number}
  </a>
)

type SortableCardProps = {
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  /** False hides the drag handle and the Move menu: the viewer may not arrange this board. */
  readonly viewerCanArrange: boolean
  readonly onMoveTo: (column: string) => void
}

export const SortableCard = ({ card, columns, viewerCanArrange, onMoveTo }: SortableCardProps) => {
  const movable = viewerCanArrange && card.readOnlyReason === null
  const sortable = useSortable({
    id: card.key,
    data: { column: card.column },
    disabled: !movable,
  })
  const reasonId = `reason-${card.key}`
  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`${cardClass} ${sortable.isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <IssueLink card={card} />
        {viewerCanArrange && (
          <div className="-my-1 -mr-1.5 flex items-center">
            {movable && <MoveMenu card={card} columns={columns} onMoveTo={onMoveTo} />}
            <button
              type="button"
              ref={sortable.setActivatorNodeRef}
              {...sortable.attributes}
              {...sortable.listeners}
              aria-label={`Move ${card.key}`}
              aria-disabled={!movable}
              aria-describedby={movable ? sortable.attributes["aria-describedby"] : reasonId}
              title={movable ? "Drag to move" : undefined}
              className={`${iconButtonClass} ${focusRing} ${
                movable ? "cursor-grab touch-none" : "cursor-not-allowed opacity-50"
              }`}
            >
              <GripIcon />
            </button>
          </div>
        )}
      </div>
      <CardContent card={card} />
      {viewerCanArrange && !movable && (
        <p
          id={reasonId}
          className="mt-2 hidden text-xs text-amber-800 group-focus-within:block group-hover:block dark:text-amber-300"
        >
          {card.repo} is archived, so this card cannot be moved.
        </p>
      )}
    </li>
  )
}

export const OverlayCard = ({ card }: { card: BoardCard }) => (
  <div className={`${cardClass} cursor-grabbing shadow-lg ring-2 ring-indigo-500`}>
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {card.repo}#{card.number}
      </span>
      <span className="text-zinc-500 dark:text-zinc-400">
        <GripIcon />
      </span>
    </div>
    <CardContent card={card} />
  </div>
)
