import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { BoardCard, BoardColumn } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { LabelChips } from "../rows.tsx"

const readOnlyReason = (card: BoardCard) =>
  `You cannot change issues in ${card.repo}, so this card cannot be moved.`

type CardBodyProps = {
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly onMoveTo?: (column: string) => void
}

/** The card's content. The drag overlay renders it without the menu. */
export const CardBody = ({ card, columns, onMoveTo }: CardBodyProps) => {
  const reasonId = `reason-${card.key}`
  return (
    <>
      <a
        href={card.url}
        className="block rounded-sm text-xs font-medium text-zinc-500 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:text-indigo-300"
      >
        {card.repo}#{card.number}
      </a>
      <p className="mt-0.5 break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {card.title}
      </p>
      <LabelChips labels={card.labels} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {card.milestone === null ? null : (
            <>
              <span className="sr-only">Milestone </span>
              {card.milestone}
            </>
          )}
        </span>
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
      {onMoveTo !== undefined && (
        <div className="mt-2">
          <label className="sr-only" htmlFor={`move-${card.key}`}>
            Move {card.repo}#{card.number} to a column
          </label>
          <select
            id={`move-${card.key}`}
            value=""
            disabled={!card.canWrite}
            aria-describedby={card.canWrite ? undefined : reasonId}
            onChange={(event) => onMoveTo(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
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
          {!card.canWrite && (
            <p
              id={reasonId}
              className="mt-1 hidden text-xs text-amber-800 group-focus-within:block group-hover:block dark:text-amber-300"
            >
              {readOnlyReason(card)}
            </p>
          )}
        </div>
      )}
    </>
  )
}

const cardClass =
  "group rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"

type SortableCardProps = CardBodyProps & { readonly onMoveTo: (column: string) => void }

export const SortableCard = ({ card, columns, onMoveTo }: SortableCardProps) => {
  const sortable = useSortable({
    id: card.key,
    data: { column: card.column },
    disabled: !card.canWrite,
  })
  return (
    <li
      // The card is its own activator, so Enter or Space on the link or menu inside it does not
      // pick it up.
      ref={(node) => {
        sortable.setNodeRef(node)
        sortable.setActivatorNodeRef(node)
      }}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-roledescription="card"
      aria-label={`${card.repo}#${card.number} ${card.title}`}
      title={card.canWrite ? undefined : readOnlyReason(card)}
      className={`${cardClass} ${
        card.canWrite ? "cursor-grab" : "cursor-default"
      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
        sortable.isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody card={card} columns={columns} onMoveTo={onMoveTo} />
    </li>
  )
}

export const OverlayCard = ({ card, columns }: CardBodyProps) => (
  <div className={`${cardClass} cursor-grabbing shadow-lg ring-2 ring-indigo-500`}>
    <CardBody card={card} columns={columns} />
  </div>
)
