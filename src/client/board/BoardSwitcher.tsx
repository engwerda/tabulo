import { useQuery } from "@tanstack/react-query"
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react"
import { Link } from "wouter"
import { MAX_BOARDS } from "../../shared/api.ts"
import { fetchBoards } from "../api.ts"
import { Glyph } from "../palette/icons.tsx"
import { boardHref } from "../scope/views.ts"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import { CheckIcon, PlusIcon, SlidersIcon } from "../ui/icons.tsx"
import { Popover } from "../ui/primitives.tsx"
import { boardListQueryKey } from "./board-view.ts"

export const useBoardList = (org: string) =>
  useQuery({ queryKey: boardListQueryKey(org), queryFn: () => fetchBoards(org) })

let refocusAfterSwitch = false

export const focusNextBoardSwitcher = () => {
  refocusAfterSwitch = true
}

const menuItem =
  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 transition pointer-coarse:min-h-11 hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none aria-disabled:cursor-default aria-disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800 dark:aria-disabled:hover:bg-transparent"

const clickOnSpace = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== " ") return
  event.preventDefault()
  event.currentTarget.click()
}

const ActionItem = ({
  icon,
  children,
  hint,
  disabled = false,
  onSelect,
}: {
  icon: ReactNode
  children: ReactNode
  hint?: string | undefined
  disabled?: boolean
  onSelect: () => void
}) => (
  <button
    type="button"
    role="menuitem"
    aria-disabled={disabled || undefined}
    onClick={() => {
      if (!disabled) onSelect()
    }}
    className={menuItem}
  >
    <span className={disabled ? "opacity-50" : ""}>{icon}</span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className={disabled ? "text-zinc-500 dark:text-zinc-400" : ""}>{children}</span>
      {hint !== undefined && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
      )}
    </span>
  </button>
)

export const BoardSwitcher = ({
  org,
  boardId,
  name,
  onEdit,
  onCreate,
}: {
  readonly org: string
  readonly boardId: string
  readonly name: string | undefined
  readonly onEdit?: (() => void) | undefined
  readonly onCreate?: (() => void) | undefined
}) => {
  const boards = useBoardList(org)
  const headingId = useId()
  const wrapper = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!refocusAfterSwitch) return
    refocusAfterSwitch = false
    if (document.activeElement === document.body) {
      wrapper.current?.querySelector<HTMLElement>("button")?.focus()
    }
  }, [])

  const listed = boards.data?.boards
  const title = name ?? listed?.find((board) => board.id === boardId)?.name
  const atLimit = listed !== undefined && listed.length >= MAX_BOARDS
  const actions = onEdit !== undefined || onCreate !== undefined

  return (
    <div ref={wrapper} className="flex max-w-[60%] min-w-0 shrink-0">
      <Popover
        containerClass="relative min-w-0"
        triggerClass="flex w-full min-w-0 items-center gap-2 rounded-lg py-1 pr-1.5 pl-1.5 text-left pointer-coarse:min-h-11 transition hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        accessibleLabel={`Board: ${title ?? "loading"}. Switch board`}
        label={
          title === undefined ? (
            <span aria-hidden="true" className="flex min-w-0 items-center gap-2">
              <span className="size-4 shrink-0 animate-shimmer rounded bg-zinc-200/70 dark:bg-zinc-800" />
              <span className="h-4 w-24 min-w-0 animate-shimmer rounded bg-zinc-200/70 max-sm:w-16 dark:bg-zinc-800" />
            </span>
          ) : (
            <>
              <Glyph name="board" className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
              <span className="truncate text-base font-semibold tracking-tight">{title}</span>
            </>
          )
        }
        panelClass="flex max-h-[calc(100dvh-8rem-var(--tab-bar-height))] w-72 flex-col p-1.5"
        focusFirstItem
      >
        {(close) => (
          <>
            {boards.isError && (
              <ErrorNotice
                bare
                tone="warning"
                title="Could not load the boards"
                onRetry={() => void boards.refetch()}
                retrying={boards.isFetching}
                className="px-2 pt-1 pb-2 [&>button]:ml-11"
              >
                {boards.error.message}
              </ErrorNotice>
            )}
            <p
              hidden={boards.isError}
              id={headingId}
              className="px-2 pt-1 pb-1.5 text-2xs font-medium text-zinc-500 dark:text-zinc-400"
            >
              Boards
            </p>
            {boards.isPending && (
              <p role="status" className="px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                Loading…
              </p>
            )}
            <div role="menu" aria-labelledby={headingId} className="flex min-h-0 flex-col">
              <div className="scroll-thin min-h-0 overflow-y-auto">
                {(listed ?? []).map((board) => {
                  const current = board.id === boardId
                  return (
                    <Link
                      key={board.id}
                      href={boardHref(org, board.id)}
                      role="menuitemradio"
                      aria-checked={current}
                      onClick={(event) => {
                        if (current) event.preventDefault()
                        else refocusAfterSwitch = true
                        close()
                      }}
                      onKeyDown={clickOnSpace}
                      className={`${menuItem} aria-checked:font-medium aria-checked:text-zinc-900 dark:aria-checked:text-zinc-50`}
                    >
                      <Glyph
                        name="board"
                        className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                      />
                      <span className="min-w-0 flex-1 truncate">{board.name}</span>
                      {current && (
                        <CheckIcon className="size-4 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </Link>
                  )
                })}
              </div>
              {actions && <hr className="mx-1 my-1.5 border-zinc-100 dark:border-zinc-800" />}
              {onEdit !== undefined && (
                <ActionItem
                  icon={<SlidersIcon className="size-4 text-zinc-500 dark:text-zinc-400" />}
                  onSelect={() => {
                    close()
                    onEdit()
                  }}
                >
                  Edit board…
                </ActionItem>
              )}
              {onCreate !== undefined && (
                <ActionItem
                  icon={<PlusIcon className="size-4 text-zinc-500 dark:text-zinc-400" />}
                  disabled={atLimit}
                  hint={
                    atLimit
                      ? `${MAX_BOARDS} boards is the most an organization can have`
                      : undefined
                  }
                  onSelect={() => {
                    close()
                    onCreate()
                  }}
                >
                  New board…
                </ActionItem>
              )}
            </div>
          </>
        )}
      </Popover>
    </div>
  )
}
