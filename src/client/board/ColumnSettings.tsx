import {
  type Announcements,
  closestCenter,
  DndContext,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Ref } from "react"
import { GripIcon } from "../ui/icons.tsx"
import { buttonClass } from "../ui/primitives.tsx"
import { ColumnDot } from "./BoardCardView.tsx"
import type { ColumnRow } from "./board-settings.ts"

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

const screenReaderInstructions = {
  draggable:
    "Press Space to pick the column up. While it is picked up, the up and down arrow keys move it, Space drops it, and Escape cancels.",
}

const Row = ({
  row,
  onHiddenChange,
  checkboxRef,
}: {
  row: ColumnRow
  onHiddenChange: (hidden: boolean) => void
  checkboxRef?: Ref<HTMLInputElement> | undefined
}) => {
  const { column, hidden } = row
  const sortable = useSortable({ id: column.key })
  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`flex items-center gap-1 rounded-lg bg-white pr-2 dark:bg-zinc-900 ${
        sortable.isDragging
          ? "relative z-10 shadow-lift ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700"
          : ""
      }`}
    >
      <button
        type="button"
        ref={sortable.setActivatorNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        aria-label={`Move ${column.title}`}
        className={`${buttonClass.iconSmall} cursor-grab touch-none active:cursor-grabbing`}
      >
        <GripIcon className="size-4" />
      </button>
      <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm pointer-coarse:min-h-11">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={!hidden}
          onChange={(event) => onHiddenChange(!event.target.checked)}
          aria-label={`Show ${column.title}`}
          className="size-4 shrink-0 cursor-pointer rounded accent-indigo-600"
        />
        <span className={hidden ? "opacity-50" : ""}>
          <ColumnDot column={column} />
        </span>
        <span
          className={`truncate ${hidden ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}`}
        >
          {column.title}
        </span>
        {hidden && (
          <span className="ml-auto shrink-0 rounded-md border border-zinc-200 px-1.5 text-2xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            Hidden
          </span>
        )}
      </label>
    </li>
  )
}

/**
 * The board's columns in order, each with a handle that drags it, by pointer or with Space and
 * the arrow keys, and a box that shows or hides it. Announcements name the column's position.
 */
export const ColumnSettings = ({
  rows,
  onMove,
  onHiddenChange,
  onDraggingChange,
  announcer,
  firstCheckboxRef,
}: {
  rows: ReadonlyArray<ColumnRow>
  /** Moves the column `key` to `index` of the order. */
  onMove: (key: string, index: number) => void
  onHiddenChange: (key: string, hidden: boolean) => void
  onDraggingChange: (dragging: boolean) => void
  /** Where the announcements go: inside the modal dialog, as the page behind it is inert. */
  announcer: Element | null
  firstCheckboxRef?: Ref<HTMLInputElement>
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const keys = rows.map((row) => row.column.key)
  const title = (id: string | number) =>
    rows.find((row) => row.column.key === String(id))?.column.title ?? "the column"
  const position = (id: string | number) =>
    `position ${keys.indexOf(String(id)) + 1} of ${keys.length}`
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)} at ${position(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over === null ? undefined : `Moved ${title(active.id)} to ${position(over.id)}.`,
    onDragEnd: ({ active, over }) =>
      over === null
        ? `${title(active.id)} did not move.`
        : `Dropped ${title(active.id)} at ${position(over.id)}.`,
    onDragCancel: ({ active }) => `Cancelled. ${title(active.id)} stays at ${position(active.id)}.`,
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      accessibility={{
        announcements,
        screenReaderInstructions,
        ...(announcer === null ? {} : { container: announcer }),
      }}
      onDragStart={() => onDraggingChange(true)}
      onDragCancel={() => onDraggingChange(false)}
      onDragEnd={({ active, over }) => {
        onDraggingChange(false)
        if (over !== null && active.id !== over.id) {
          onMove(String(active.id), keys.indexOf(String(over.id)))
        }
      }}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ol className="space-y-0.5">
          {rows.map((row, index) => (
            <Row
              key={row.column.key}
              row={row}
              onHiddenChange={(hidden) => onHiddenChange(row.column.key, hidden)}
              checkboxRef={index === 0 ? firstCheckboxRef : undefined}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}
