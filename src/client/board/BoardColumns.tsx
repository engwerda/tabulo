import {
  type Announcements,
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useState } from "react"
import type { Board, BoardCard, BoardColumn } from "../../shared/api.ts"
import { OverlayCard, SortableCard } from "./BoardCardView.tsx"
import { type CardMove, columnCards, dropNeighbours } from "./board-view.ts"

const COLUMN_PREFIX = "column:"

type BoardColumnsProps = {
  readonly board: Board
  /** Cards that pass the filters. Moves are computed against every card of the board. */
  readonly visible: (card: BoardCard) => boolean
  readonly onMove: (move: CardMove) => void
  readonly onDragChange: (dragging: boolean) => void
}

const Column = ({
  index,
  column,
  cards,
  columns,
  highlighted,
  viewerCanArrange,
  onMoveTo,
}: {
  index: number
  column: BoardColumn
  cards: ReadonlyArray<BoardCard>
  columns: ReadonlyArray<BoardColumn>
  highlighted: boolean
  viewerCanArrange: boolean
  onMoveTo: (card: BoardCard, column: string) => void
}) => {
  const droppable = useDroppable({
    id: `${COLUMN_PREFIX}${column.key}`,
    data: { column: column.key },
  })
  // Column keys are label names with spaces and slashes, which aria-labelledby cannot reference.
  const headingId = `board-column-${index}`
  return (
    <section
      aria-labelledby={headingId}
      className={`flex w-64 shrink-0 flex-col rounded-xl border bg-zinc-100/70 dark:bg-zinc-900/60 ${
        highlighted
          ? "border-indigo-400 dark:border-indigo-500"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold">
          {column._tag === "Status" && (
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: column.label.color }}
            />
          )}
          {column.title}
        </h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {cards.length}
        </span>
      </header>
      <SortableContext items={cards.map((card) => card.key)} strategy={verticalListSortingStrategy}>
        <ul ref={droppable.setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
          {cards.length === 0 && (
            <li className="px-1 py-2 text-xs text-zinc-500 dark:text-zinc-400">No issues</li>
          )}
          {cards.map((card) => (
            <SortableCard
              key={card.key}
              card={card}
              columns={columns}
              viewerCanArrange={viewerCanArrange}
              onMoveTo={(target) => onMoveTo(card, target)}
            />
          ))}
        </ul>
      </SortableContext>
    </section>
  )
}

export const BoardColumns = ({ board, visible, onMove, onDragChange }: BoardColumnsProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)

  const cardsByKey = new Map(board.cards.map((card) => [card.key, card] as const))
  const shownKeys = (column: string) =>
    columnCards(board.cards, column)
      .filter(visible)
      .map((card) => card.key)
  const columnTitle = (key: string | null | undefined) =>
    board.columns.find((column) => column.key === key)?.title ?? "no column"
  const targetColumn = (overId: string | number | undefined) => {
    if (overId === undefined) return undefined
    const id = String(overId)
    return id.startsWith(COLUMN_PREFIX)
      ? id.slice(COLUMN_PREFIX.length)
      : cardsByKey.get(id)?.column
  }
  const describe = (id: string | number) => {
    const card = cardsByKey.get(String(id))
    return card === undefined ? "the card" : `${card.repo}#${card.number} ${card.title}`
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over === null
        ? `${describe(active.id)} is not over a column.`
        : `${describe(active.id)} is over ${columnTitle(targetColumn(over.id))}.`,
    onDragEnd: ({ active, over }) =>
      over === null
        ? `${describe(active.id)} was dropped outside the board and did not move.`
        : `${describe(active.id)} was dropped in ${columnTitle(targetColumn(over.id))}.`,
    onDragCancel: ({ active }) => `Moving ${describe(active.id)} was cancelled.`,
  }

  const finish = () => {
    setActiveKey(null)
    setOverColumn(null)
    onDragChange(false)
  }

  const dropped = ({ active, over }: DragEndEvent) => {
    finish()
    const card = cardsByKey.get(String(active.id))
    const toColumn = targetColumn(over?.id)
    if (card === undefined || over === null || toColumn === undefined) return
    const shown = shownKeys(toColumn)
    const others = shown.filter((key) => key !== card.key)
    const overId = String(over.id)
    if (overId.startsWith(COLUMN_PREFIX)) {
      onMove({ key: card.key, toColumn, ...dropNeighbours(shown, card.key, others.length) })
      return
    }
    if (overId === card.key) return
    const from = shown.indexOf(card.key)
    const to = shown.indexOf(overId)
    // Within a column a card dragged down lands after the card it is over, as the sortable
    // preview shows; coming from another column it lands before it.
    const index = others.indexOf(overId) + (from !== -1 && from < to ? 1 : 0)
    onMove({ key: card.key, toColumn, ...dropNeighbours(shown, card.key, index) })
  }

  const active = activeKey === null ? undefined : cardsByKey.get(activeKey)
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements }}
      onDragStart={({ active }) => {
        setActiveKey(String(active.id))
        onDragChange(true)
      }}
      onDragOver={({ over }) => setOverColumn(targetColumn(over?.id) ?? null)}
      onDragEnd={dropped}
      onDragCancel={finish}
    >
      <div className="flex items-start gap-3 overflow-x-auto px-4 pb-6 sm:px-6">
        {board.columns.map((column, index) => (
          <Column
            key={column.key}
            index={index}
            column={column}
            cards={columnCards(board.cards, column.key).filter(visible)}
            columns={board.columns}
            highlighted={activeKey !== null && overColumn === column.key}
            viewerCanArrange={board.viewerCanArrange}
            onMoveTo={(card, toColumn) =>
              onMove({
                key: card.key,
                toColumn,
                ...dropNeighbours(shownKeys(toColumn), card.key, 0),
              })
            }
          />
        ))}
      </div>
      <DragOverlay>{active === undefined ? null : <OverlayCard card={active} />}</DragOverlay>
    </DndContext>
  )
}
