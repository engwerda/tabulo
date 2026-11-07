import {
  type Announcements,
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { type ReactNode, useRef, useState } from "react"
import type { Board, BoardCard, BoardColumn } from "../../shared/api.ts"
import { CollapseIcon, ExpandIcon, PlusIcon } from "../ui/icons.tsx"
import { buttonClass } from "../ui/primitives.tsx"
import { type CardActions, ColumnDot, OverlayCard, SortableCard } from "./BoardCardView.tsx"
import {
  type CardMove,
  columnCards,
  type DragPreview,
  neighboursAfterDrop,
  previewKeys,
} from "./board-view.ts"

const COLUMN_PREFIX = "column:"

type BoardColumnsProps = {
  readonly board: Board
  /** Cards that pass the filters. Moves are computed against every card of the board. */
  readonly visible: (card: BoardCard) => boolean
  readonly filtered: boolean
  readonly viewer: string
  readonly selectedKey: string | null
  readonly collapsed: ReadonlySet<string>
  readonly onToggleCollapsed: (column: string) => void
  /** The column whose composer is open, and the composer itself. */
  readonly composing: string | null
  readonly composer: ReactNode
  readonly onCompose: (column: string) => void
  readonly canCreate: boolean
  readonly actions: CardActions
  readonly hrefBase: string
  readonly onMove: (move: CardMove) => void
  readonly onDragChange: (dragging: boolean) => void
}

type ColumnProps = {
  readonly index: number
  readonly column: BoardColumn
  readonly cards: ReadonlyArray<BoardCard>
  /** How many cards pass the filters, not counting a card dragged in from another column. */
  readonly shown: number
  readonly total: number
  readonly highlighted: boolean
  readonly collapsed: boolean
  readonly children: ReactNode
  readonly header: ReactNode
  readonly onToggleCollapsed: () => void
}

const Column = ({
  index,
  column,
  cards,
  shown,
  total,
  highlighted,
  collapsed,
  children,
  header,
  onToggleCollapsed,
}: ColumnProps) => {
  const droppable = useDroppable({
    id: `${COLUMN_PREFIX}${column.key}`,
    data: { column: column.key },
  })
  // Column keys are label names with spaces and slashes, which aria-labelledby cannot reference.
  const headingId = `board-column-${index}`
  const count = (
    <span
      className={`rounded-full px-1.5 py-px text-[0.6875rem] font-semibold tabular-nums ${
        highlighted
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
          : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
      title={shown === total ? undefined : `${shown} of ${total} shown`}
    >
      {shown === total ? total : `${shown}/${total}`}
    </span>
  )

  if (collapsed) {
    return (
      <section
        ref={droppable.setNodeRef}
        aria-labelledby={headingId}
        className={`flex w-11 shrink-0 flex-col items-center gap-3 rounded-2xl border py-3 transition-colors ${
          highlighted
            ? "border-indigo-300 bg-indigo-50 dark:border-indigo-500/50 dark:bg-indigo-500/10"
            : "border-transparent bg-zinc-100/80 hover:bg-zinc-200/60 dark:bg-zinc-900/60 dark:hover:bg-zinc-900"
        }`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded="false"
          aria-label={`Expand ${column.title}`}
          title={`Expand ${column.title}`}
          className={buttonClass.iconSmall}
        >
          <ExpandIcon className="size-3.5" />
        </button>
        <ColumnDot column={column} />
        <h2
          id={headingId}
          className="text-sm font-semibold text-zinc-700 [writing-mode:vertical-rl] dark:text-zinc-300"
        >
          {column.title}
        </h2>
        {count}
      </section>
    )
  }

  return (
    <section
      aria-labelledby={headingId}
      className={`flex h-full min-w-[16.5rem] max-w-[24rem] shrink-0 grow basis-[16.5rem] snap-start flex-col rounded-2xl border transition-colors max-sm:basis-[85vw] ${
        highlighted
          ? "border-indigo-300 bg-indigo-50/70 dark:border-indigo-500/50 dark:bg-indigo-500/[0.07]"
          : "border-transparent bg-zinc-100/80 dark:bg-zinc-900/50"
      }`}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 pr-1.5 pl-3.5">
        <ColumnDot column={column} />
        <h2
          id={headingId}
          className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200"
        >
          {column.title}
        </h2>
        {count}
        <span className="ml-auto flex items-center">
          {header}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded="true"
            aria-label={`Collapse ${column.title}`}
            title={`Collapse ${column.title}`}
            className={buttonClass.iconSmall}
          >
            <CollapseIcon className="size-3.5" />
          </button>
        </span>
      </header>
      <SortableContext items={cards.map((card) => card.key)} strategy={verticalListSortingStrategy}>
        <ul
          ref={droppable.setNodeRef}
          className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-0.5 pb-3"
        >
          {children}
        </ul>
      </SortableContext>
    </section>
  )
}

const EmptyColumn = ({ filtered, column }: { filtered: boolean; column: BoardColumn }) => (
  <li className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300/80 px-4 py-8 text-center text-xs text-zinc-500 dark:border-zinc-700/80 dark:text-zinc-500">
    {filtered
      ? "No cards here match the filters."
      : column._tag === "Done"
        ? "Nothing closed recently. Drop a card here to close its issue."
        : "No issues. Drop a card here."}
  </li>
)

export const BoardColumns = ({
  board,
  visible,
  filtered,
  viewer,
  selectedKey,
  collapsed,
  onToggleCollapsed,
  composing,
  composer,
  onCompose,
  canCreate,
  actions,
  hrefBase,
  onMove,
  onDragChange,
}: BoardColumnsProps) => {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter on a card opens its details, so only Space picks a card up.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  )
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)
  // The dragged card shows in the column it is over, so that column opens a gap where it lands.
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const showRepo = board.repos.length > 1

  const cardsByKey = new Map(board.cards.map((card) => [card.key, card] as const))
  const shownKeys = (column: string) =>
    columnCards(board.cards, column)
      .filter(visible)
      .map((card) => card.key)
  const columnTitle = (key: string | null | undefined) =>
    board.columns.find((column) => column.key === key)?.title ?? "no column"
  const shownDuringDrag = (column: string) => previewKeys(shownKeys(column), column, preview)
  const targetColumn = (overId: string | number | undefined) => {
    if (overId === undefined) return undefined
    const id = String(overId)
    if (id.startsWith(COLUMN_PREFIX)) return id.slice(COLUMN_PREFIX.length)
    if (preview !== null && id === preview.key) return preview.column
    return cardsByKey.get(id)?.column
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

  // A collapsed column is a narrow strip that corner distances never favour, so the pointer
  // decides when it is over one; everything else goes by the closest corners.
  const collision: CollisionDetection = (args) => {
    const strips = args.droppableContainers.filter((container) => {
      const id = String(container.id)
      return id.startsWith(COLUMN_PREFIX) && collapsed.has(id.slice(COLUMN_PREFIX.length))
    })
    const onStrip = pointerWithin({ ...args, droppableContainers: strips })
    return onStrip.length > 0 ? onStrip : closestCorners(args)
  }

  const finish = () => {
    setActiveKey(null)
    setOverColumn(null)
    setPreview(null)
    onDragChange(false)
  }

  const draggedOver = ({ active, over }: DragOverEvent) => {
    const key = String(active.id)
    const card = cardsByKey.get(key)
    const toColumn = targetColumn(over?.id)
    setOverColumn(toColumn ?? null)
    if (card === undefined || over === null || toColumn === undefined) return
    if (toColumn === (preview?.column ?? card.column)) return
    if (toColumn === card.column) {
      setPreview(null)
      return
    }
    const others = shownKeys(toColumn).filter((other) => other !== key)
    const overIndex = others.indexOf(String(over.id))
    const dragged = active.rect.current.translated
    const below = dragged !== null && dragged.top > over.rect.top + over.rect.height / 2
    setPreview({
      key,
      column: toColumn,
      index: overIndex === -1 ? others.length : overIndex + (below ? 1 : 0),
    })
  }

  const dropped = ({ active, over }: DragEndEvent) => {
    const key = String(active.id)
    const card = cardsByKey.get(key)
    const toColumn = targetColumn(over?.id)
    const keys = toColumn === undefined ? [] : shownDuringDrag(toColumn)
    finish()
    if (card === undefined || over === null || toColumn === undefined) return
    const overId = String(over.id)
    const neighbours = neighboursAfterDrop(
      keys,
      key,
      overId.startsWith(COLUMN_PREFIX) ? null : overId,
    )
    if (toColumn === card.column) {
      const unchanged = neighboursAfterDrop(shownKeys(card.column), key, null)
      if (
        unchanged.afterKey === neighbours.afterKey &&
        unchanged.beforeKey === neighbours.beforeKey
      ) {
        return
      }
    }
    onMove({ key, toColumn, ...neighbours })
  }

  const active = activeKey === null ? undefined : cardsByKey.get(activeKey)
  const scroller = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(0)
  // On a phone one column fills the screen; the tabs above say which one and jump to others.
  const trackColumn = () => {
    const element = scroller.current
    if (element === null) return
    const columns = [...element.children] as Array<HTMLElement>
    const left = element.scrollLeft + element.clientWidth / 3
    const index = columns.findLastIndex((column) => column.offsetLeft <= left)
    setInView(Math.max(0, index))
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{ announcements }}
      onDragStart={({ active }) => {
        setActiveKey(String(active.id))
        onDragChange(true)
      }}
      onDragOver={draggedOver}
      onDragEnd={dropped}
      onDragCancel={finish}
    >
      <div className="flex h-full min-h-0 flex-col">
        <nav
          aria-label="Columns"
          className="scroll-thin flex shrink-0 gap-1 overflow-x-auto px-4 pb-2 sm:hidden"
        >
          {board.columns.map((column, index) => (
            <button
              key={column.key}
              type="button"
              aria-current={inView === index ? "true" : undefined}
              onClick={() =>
                (scroller.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({
                  behavior: "smooth",
                  inline: "start",
                  block: "nearest",
                })
              }
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                inView === index
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {column.title}
              <span className="tabular-nums opacity-60">
                {columnCards(board.cards, column.key).filter(visible).length}
              </span>
            </button>
          ))}
        </nav>
        <div
          ref={scroller}
          onScroll={trackColumn}
          className="scroll-thin flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:snap-none sm:px-6"
        >
          {board.columns.map((column, index) => {
            const all = columnCards(board.cards, column.key)
            const cards = shownDuringDrag(column.key).flatMap((key) => cardsByKey.get(key) ?? [])
            const isComposing = composing === column.key
            return (
              <Column
                key={column.key}
                index={index}
                column={column}
                cards={cards}
                shown={cards.length}
                total={all.length + (cards.length - all.filter(visible).length)}
                highlighted={activeKey !== null && overColumn === column.key}
                collapsed={collapsed.has(column.key) && !isComposing}
                onToggleCollapsed={() => onToggleCollapsed(column.key)}
                header={
                  canCreate &&
                  column._tag !== "Done" && (
                    <button
                      type="button"
                      onClick={() => onCompose(column.key)}
                      aria-label={`New issue in ${column.title}`}
                      title={`New issue in ${column.title}`}
                      className={buttonClass.iconSmall}
                    >
                      <PlusIcon className="size-3.5" />
                    </button>
                  )
                }
              >
                {isComposing && <li>{composer}</li>}
                {cards.length === 0 && !isComposing && (
                  <EmptyColumn filtered={filtered && all.length > 0} column={column} />
                )}
                {cards.map((card) => (
                  <SortableCard
                    key={card.key}
                    card={card}
                    columns={board.columns}
                    viewerCanArrange={board.viewerCanArrange}
                    viewer={viewer}
                    showRepo={showRepo}
                    selected={selectedKey === card.key}
                    actions={actions}
                    hrefBase={hrefBase}
                  />
                ))}
              </Column>
            )
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {active === undefined ? null : <OverlayCard card={active} showRepo={showRepo} />}
      </DragOverlay>
    </DndContext>
  )
}
