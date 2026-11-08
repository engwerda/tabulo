import {
  type Announcements,
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MouseSensor,
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
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Board, BoardCard, BoardColumn } from "../../shared/api.ts"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapseIcon,
  ExpandIcon,
  PlusIcon,
} from "../ui/icons.tsx"
import { buttonClass, Segmented } from "../ui/primitives.tsx"
import { type CardActions, ColumnDot, OverlayCard, SortableCard } from "./BoardCardView.tsx"
import {
  type CardMove,
  columnCards,
  type DragPreview,
  neighboursAfterDrop,
  previewKeys,
} from "./board-view.ts"

const COLUMN_PREFIX = "column:"

/**
 * Left and right move a picked-up card one column at a time, collapsed columns included, to the
 * top of that column. Up and down move it within a column as the sortable list does.
 */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") {
    return sortableKeyboardCoordinates(event, args)
  }
  const { collisionRect, droppableRects, droppableContainers } = args.context
  if (collisionRect === null) return undefined
  const columns = droppableContainers
    .getEnabled()
    .filter((container) => String(container.id).startsWith(COLUMN_PREFIX))
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      return rect === undefined ? [] : [rect]
    })
    .sort((a, b) => a.left - b.left)
  const middle = collisionRect.left + collisionRect.width / 2
  const distance = (rect: { left: number; right: number }) =>
    middle < rect.left ? rect.left - middle : middle > rect.right ? middle - rect.right : 0
  const current = columns.reduce(
    (best, rect, index) =>
      best === -1 || distance(rect) < distance(columns[best] ?? rect) ? index : best,
    -1,
  )
  const target = columns[current + (event.code === "ArrowRight" ? 1 : -1)]
  if (target === undefined) return undefined
  event.preventDefault()
  return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 4 }
}

/** The narrowest a column gets so that whole columns fill the board beside the details panel. */
const FITTED_MIN = 224
const FITTED_MAX = 384
const wideQuery = window.matchMedia("(min-width: 64rem)")

/**
 * Beside the details panel the board shows whole columns: as many as fit at FITTED_MIN or
 * wider share its width, and scrolling snaps from column to column. Null lets columns size
 * themselves, as they do without the panel or where the panel covers the board.
 */
const useFittedWidth = (scroller: RefObject<HTMLDivElement | null>, panelOpen: boolean) => {
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = scroller.current
    if (!panelOpen || element === null) {
      setWidth(null)
      return
    }
    const measure = () => {
      if (!wideQuery.matches) {
        setWidth(null)
        return
      }
      const style = getComputedStyle(element)
      const space =
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const gap = parseFloat(style.columnGap) || 0
      const fit = Math.max(1, Math.floor((space + gap) / (FITTED_MIN + gap)))
      setWidth(Math.min(FITTED_MAX, Math.floor((space - (fit - 1) * gap) / fit)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [scroller, panelOpen])
  return width
}

const screenReaderInstructions = {
  draggable:
    "Press Enter to open the card's details, or Space to pick it up. While it is picked up, the arrow keys move it, Space drops it, and Escape cancels. Arrow keys move between cards, and the period key opens the card's menu.",
}

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
  /** Keys of cards whose move Forgejo has not confirmed yet. */
  readonly saving: ReadonlySet<string>
  /** The details panel covers the right of the board, so the board leaves room for it. */
  readonly panelOpen: boolean
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
  /** A fixed width that makes whole columns fill the board beside the panel. */
  readonly width: number | null
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
  width,
}: ColumnProps) => {
  const droppable = useDroppable({
    id: `${COLUMN_PREFIX}${column.key}`,
    data: { column: column.key },
  })
  // Column keys are label names with spaces and slashes, which aria-labelledby cannot reference.
  const headingId = `board-column-${index}`
  const count = (
    <span
      className={`text-xs font-medium tabular-nums ${
        highlighted ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-600 dark:text-zinc-400"
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
        className={`flex w-11 shrink-0 snap-start flex-col items-center gap-3 rounded-xl py-2 transition-colors ${
          highlighted
            ? columnHighlight
            : `${columnSurface} hover:bg-zinc-200/50 dark:hover:bg-zinc-900`
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
      style={width === null ? undefined : { flex: "none", width, minWidth: 0 }}
      className={`group/column flex h-full min-w-[14.5rem] max-w-[24rem] shrink grow basis-[16.5rem] snap-start flex-col rounded-xl transition-colors max-sm:w-[85vw] max-sm:max-w-none max-sm:shrink-0 max-sm:grow-0 max-sm:basis-auto ${
        highlighted ? columnHighlight : columnSurface
      }`}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3">
        <ColumnDot column={column} />
        <h2
          id={headingId}
          className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200"
        >
          {column.title}
        </h2>
        {count}
        {/* Where a pointer can hover, the column's actions show on hover or focus only. */}
        <span className="ml-auto flex items-center transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/column:opacity-100 [@media(hover:hover)]:group-hover/column:opacity-100">
          {header}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded="true"
            aria-label={`Collapse ${column.title}`}
            title={`Collapse ${column.title}`}
            className={`${buttonClass.iconSmall} max-sm:hidden`}
          >
            <CollapseIcon className="size-3.5" />
          </button>
        </span>
      </header>
      <SortableContext items={cards.map((card) => card.key)} strategy={verticalListSortingStrategy}>
        <ul
          ref={droppable.setNodeRef}
          className="scroll-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pt-0.5 pb-2"
        >
          {children}
        </ul>
      </SortableContext>
    </section>
  )
}

/** The column's surface, and its look while a dragged card is over it. */
const columnSurface = "bg-zinc-100/70 dark:bg-zinc-900/60"
const columnHighlight =
  "bg-indigo-50/80 ring-1 ring-indigo-200 ring-inset dark:bg-indigo-500/[0.07] dark:ring-indigo-500/30"

const EmptyColumn = ({ filtered, column }: { filtered: boolean; column: BoardColumn }) => (
  <li className="px-3 py-5 text-center text-xs text-zinc-600 dark:text-zinc-400">
    {filtered
      ? "No cards match the filters"
      : column._tag === "Done"
        ? "Nothing closed recently"
        : "No issues"}
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
  saving,
  panelOpen,
  onMove,
  onDragChange,
}: BoardColumnsProps) => {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
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
  /**
   * Column first, then place: the column is the one under the pointer (the card's middle for a
   * keyboard drag), and only that column's cards and list compete for the drop. Corner distances
   * across the whole board would let a card in the next column beat a tall, empty list.
   */
  const collision: CollisionDetection = (args) => {
    const point = args.pointerCoordinates ?? {
      x: args.collisionRect.left + args.collisionRect.width / 2,
      y: args.collisionRect.top + args.collisionRect.height / 2,
    }
    const columnUnder = args.droppableContainers.find((container) => {
      if (!String(container.id).startsWith(COLUMN_PREFIX)) return false
      const rect = args.droppableRects.get(container.id)
      // A list is inset from its column by the column's padding and the gap between columns.
      return rect !== undefined && point.x >= rect.left - 14 && point.x <= rect.right + 14
    })
    if (columnUnder === undefined) return closestCorners(args)
    const column = String(columnUnder.id).slice(COLUMN_PREFIX.length)
    if (collapsed.has(column)) return [{ id: columnUnder.id }]
    const inColumn = args.droppableContainers.filter(
      (container) => container.id === columnUnder.id || targetColumn(container.id) === column,
    )
    const found = closestCorners({ ...args, droppableContainers: inColumn })
    return found.length > 0 ? found : [{ id: columnUnder.id }]
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
    requestAnimationFrame(() => {
      if (collapsed.has(toColumn)) {
        // The card is hidden in the collapsed column, so the keyboard lands on its rail.
        const title = columnTitle(toColumn)
        document
          .querySelector<HTMLElement>(`button[aria-label="Expand ${CSS.escape(title)}"]`)
          ?.focus()
      } else {
        // A card dropped into a long column stays in sight.
        document
          .querySelector(`[data-card-key="${CSS.escape(key)}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })
      }
    })
  }

  const active = activeKey === null ? undefined : cardsByKey.get(activeKey)
  const scroller = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(0)
  // On a phone one column fills the screen; the tabs above say which one and jump to others.
  const trackColumn = () => {
    const element = scroller.current
    if (element === null) return
    const columns = [...element.children] as Array<HTMLElement>
    // The last column can never scroll to the left edge, so the end of the scroller selects it.
    if (element.scrollLeft + element.clientWidth >= element.scrollWidth - 2) {
      setInView(columns.length - 1)
      return
    }
    const left = element.scrollLeft + element.clientWidth / 3
    const index = columns.findLastIndex((column) => column.offsetLeft <= left)
    setInView(Math.max(0, index))
  }
  const tabs = useRef<HTMLDivElement>(null)
  const fittedWidth = useFittedWidth(scroller, panelOpen)
  // Beside the panel the gutters clip to whole columns, so arrows there say that more columns
  // lie to that side, and scroll to them.
  const [more, setMore] = useState({ before: false, after: false })
  const measureMore = () => {
    const element = scroller.current
    if (element === null) return
    const before = element.scrollLeft > 1
    const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 1
    setMore((current) =>
      current.before === before && current.after === after ? current : { before, after },
    )
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: measures again whenever the columns change size
  useLayoutEffect(measureMore, [fittedWidth, collapsed, board.columns.length])
  const scrollColumns = (direction: -1 | 1) => {
    const element = scroller.current
    if (element === null) return
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0
    element.scrollBy({ left: direction * ((fittedWidth ?? FITTED_MIN) + gap), behavior: "smooth" })
  }
  // The open card stays in view beside the details panel, also while J and K browse and once
  // the columns have been fitted beside the panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again once the columns are fitted
  useEffect(() => {
    if (selectedKey === null) return
    document
      .querySelector(`[data-card-key="${CSS.escape(selectedKey)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })
  }, [selectedKey, fittedWidth])
  // The tab of the column in view stays in view too.
  useEffect(() => {
    const tab = tabs.current?.querySelectorAll("button")[inView]
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [inView])
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{ announcements, screenReaderInstructions }}
      // Near an edge the board scrolls gently, so a held card does not race past columns.
      autoScroll={{ acceleration: 2, interval: 16, threshold: { x: 0.1, y: 0.15 } }}
      onDragStart={({ active }) => {
        setActiveKey(String(active.id))
        onDragChange(true)
      }}
      onDragOver={draggedOver}
      onDragEnd={dropped}
      onDragCancel={finish}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          ref={tabs}
          className={`scroll-thin mx-4 mb-2 shrink-0 overflow-x-auto [scrollbar-width:none] sm:hidden ${
            // The strip can run past the screen; a fade at its end says there is more.
            inView < board.columns.length - 1
              ? "[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]"
              : ""
          }`}
        >
          <Segmented
            label="Jump to a column"
            value={board.columns[inView]?.key ?? ""}
            onChange={(key) => {
              const index = board.columns.findIndex((column) => column.key === key)
              ;(scroller.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({
                behavior: "smooth",
                inline: "start",
                block: "nearest",
              })
            }}
            options={board.columns.map((column, index) => ({
              value: column.key,
              label: (
                <>
                  {column.title}
                  <span
                    className={
                      index === inView
                        ? "text-zinc-600 dark:text-zinc-300"
                        : "text-zinc-600 dark:text-zinc-400"
                    }
                  >
                    {columnCards(board.cards, column.key).filter(visible).length}
                  </span>
                </>
              ),
            }))}
            size="sm"
            className="min-w-full [&>button]:h-8 [&>button]:flex-1 pointer-coarse:[&>button]:h-11"
          />
        </div>
        <div className={`relative flex min-h-0 flex-1 ${panelOpen ? "lg:mr-[32rem]" : ""}`}>
          <div
            ref={scroller}
            onScroll={() => {
              trackColumn()
              measureMore()
            }}
            // No transition: reduced motion gives every element a 1ms one, and the open card's
            // scroll into view must measure the board already narrowed beside the panel.
            className={`scroll-thin flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-4 transition-none sm:snap-none sm:px-6 ${
              // The gutters clip at the padding, where the fitted columns start and end.
              panelOpen
                ? "lg:snap-x lg:snap-mandatory lg:scroll-px-6 lg:[clip-path:inset(0_1.5rem)]"
                : ""
            }`}
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
                  width={fittedWidth}
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
                  {cards.map((card, position) => (
                    <SortableCard
                      key={card.key}
                      tabbable={position === 0}
                      card={card}
                      columns={board.columns}
                      viewerCanArrange={board.viewerCanArrange}
                      viewer={viewer}
                      showRepo={showRepo}
                      selected={selectedKey === card.key}
                      actions={actions}
                      hrefBase={hrefBase}
                      saving={saving.has(card.key)}
                    />
                  ))}
                </Column>
              )
            })}
          </div>
          {panelOpen &&
            (
              [
                ["before", -1, "left-0", "Show earlier columns", ChevronLeftIcon],
                ["after", 1, "right-0", "Show later columns", ChevronRightIcon],
              ] as const
            ).map(
              ([side, direction, position, label, Icon]) =>
                more[side] && (
                  <button
                    key={side}
                    type="button"
                    // Keyboard users reach the columns with Tab, and the board follows focus.
                    tabIndex={-1}
                    onClick={() => scrollColumns(direction)}
                    aria-label={label}
                    title={label}
                    className={`absolute top-0 ${position} hidden h-10 w-6 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-900 lg:grid dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`}
                  >
                    <Icon className="size-4" />
                  </button>
                ),
            )}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {active === undefined ? null : <OverlayCard card={active} showRepo={showRepo} />}
      </DragOverlay>
    </DndContext>
  )
}
