import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Link, useLocation, useSearchParams } from "wouter"
import {
  type Board,
  type BoardCard,
  type CardUpdateResult,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  MAX_BOARDS,
  type MoveCardRequest,
} from "../../shared/api.ts"
import {
  createCard,
  fetchBoard,
  fetchOrgRepos,
  fetchOrgs,
  isNotFound,
  moveCard,
  RequestFailed,
  setAssignee,
} from "../api.ts"
import { absoluteTime, relativeTime } from "../format.ts"
import { ShortcutsDialog, usePageShortcuts } from "../palette/ShortcutsDialog.tsx"
import { usePageCommands } from "../palette/use-palette-groups.ts"
import { ORGS, OrgSwitcher } from "../scope/OrgPicker.tsx"
import { forgetBoard, rememberBoard } from "../scope/remembered.ts"
import {
  boardHref,
  boardIdFromPath,
  canonicalBoardHref,
  type OrgViewParams,
  orgViewHref,
} from "../scope/views.ts"
import { useViewer } from "../session.ts"
import { ErrorNotice, sentence } from "../ui/ErrorNotice.tsx"
import { IssueRef } from "../ui/IssueRef.tsx"
import {
  ColumnsIcon,
  InfoIcon,
  KeyboardIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
} from "../ui/icons.tsx"
import { buttonClass, isTypingTarget, Kbd, Popover, touchTarget } from "../ui/primitives.tsx"
import { RepoPaletteProvider } from "../ui/repo-palette.tsx"
import { useToast } from "../ui/toast.tsx"
import type { CardActions } from "./BoardCardView.tsx"
import { BoardColumns } from "./BoardColumns.tsx"
import { BoardFiltersBar } from "./BoardFiltersBar.tsx"
import { BoardSettingsDialog, type SettingsMode } from "./BoardSettingsDialog.tsx"
import { BoardSwitcher, useBoardList } from "./BoardSwitcher.tsx"
import { boardCommands } from "./board-commands.ts"
import { draftOf, toUpdateRequest } from "./board-settings.ts"
import {
  applyMove,
  boardQueryKey,
  boardWriteKey,
  type CardMove,
  columnCards,
  FILTER_PARAMS,
  isFiltered,
  ME,
  matchesFilters,
  readFilters,
  replaceCard,
  revertMove,
  withFilter,
} from "./board-view.ts"
import { CardComposer } from "./CardComposer.tsx"
import { CardPanel } from "./CardPanel.tsx"
import { drafts, titleDraftKey } from "./drafts.ts"
import { BOARD_SHORTCUTS } from "./shortcuts.ts"
import { useBoardReads, useBoardWrites } from "./use-board-writes.ts"

const REFRESH_MS = 60_000
const NO_COMMANDS: ReturnType<typeof boardCommands> = []

// The command menu gives focus back to where it was as it closes, after its command runs, so a
// command that moves focus waits until the menu has closed.
const afterPaletteCloses = (run: () => void) => () => void window.setTimeout(run)

/**
 * A change to a card's assignees, labels, or milestone. `done` says what happened in the toast
 * ("Added Kind/Bug to api#3"), `issue` names the issue if it fails, and `undo` reverses it.
 */
export type CardUpdate = {
  readonly run: () => Promise<CardUpdateResult>
  readonly done: string
  readonly issue: string
  /** Reverses the change, and says what that did ("Removed Kind/Bug from api#3"). */
  readonly undo?: { readonly run: () => Promise<CardUpdateResult>; readonly done: string }
}
const CARD_PARAM = "card"

/** The toast key of a card: a newer toast about the card replaces an older one and its Undo. */
const aboutCard = ({ repo, number }: { readonly repo: string; readonly number: number }) =>
  `card:${repo}#${number}`

// Remembering choices is a convenience: storage can be missing or refuse writes.
const storage = {
  read: (key: string) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  write: (key: string, value: string | null) => {
    try {
      if (value === null) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, value)
    } catch {}
  },
}

const collapsedKeyBeforeBoards = (org: string) => `tabulo.board.collapsed.${org.toLowerCase()}`
const collapsedKey = (org: string, board: string) =>
  board === DEFAULT_BOARD_ID
    ? collapsedKeyBeforeBoards(org)
    : `${collapsedKeyBeforeBoards(org)}/${board}`
const composerRepoKey = (org: string) => `tabulo.board.new-issue-repo.${org.toLowerCase()}`

const readCollapsed = (key: string): ReadonlySet<string> => {
  try {
    const parsed: unknown = JSON.parse(storage.read(key) ?? "[]")
    return new Set(Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [])
  } catch {
    return new Set()
  }
}

/** `repo#number`, the card parameter's value. */
const cardRef = (card: BoardCard) => `${card.repo}#${card.number}`

const subscribeOnline = (changed: () => void) => {
  window.addEventListener("online", changed)
  window.addEventListener("offline", changed)
  return () => {
    window.removeEventListener("online", changed)
    window.removeEventListener("offline", changed)
  }
}

/** Whether the browser has a network connection; writes wait while it has none. */
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine)

/** Re-renders every half minute so "updated 2 minutes ago" stays true. */
const useNow = () => {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const Notice = ({ children }: { children: ReactNode }) => (
  <div
    role="status"
    className="mx-4 mb-3 flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-700 sm:mx-6 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
  >
    <InfoIcon className="mt-0.5 size-4 text-zinc-400" />
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

const BoardSkeleton = () => (
  <div className="flex h-full gap-3 overflow-hidden px-4 pb-4 sm:px-6" aria-hidden="true">
    {[5, 3, 4, 2, 3].map((count, column) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        key={column}
        className="flex min-w-[14.5rem] flex-1 flex-col gap-1.5 rounded-xl bg-zinc-100/70 p-1.5 dark:bg-zinc-900/60"
      >
        <div className="mx-1.5 my-2.5 h-4 w-24 animate-shimmer rounded bg-zinc-200 dark:bg-zinc-800" />
        {Array.from({ length: count }, (_, card) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            key={card}
            className="h-[5.5rem] animate-shimmer rounded-xl border border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            style={{ animationDelay: `${(column + card) * 80}ms` }}
          />
        ))}
      </div>
    ))}
  </div>
)

const EmptyBoard = ({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) => (
  <div className="grid flex-1 place-items-center px-6 pb-16">
    <div className="max-w-sm text-center">
      <div className="mx-auto flex h-20 w-28 items-end justify-center gap-1.5 rounded-xl bg-gradient-to-b from-indigo-50 to-white p-3 ring-1 ring-indigo-100 dark:from-indigo-500/10 dark:to-transparent dark:ring-indigo-500/20">
        {[70, 45, 58].map((height) => (
          <span
            key={height}
            className="w-6 rounded-md bg-indigo-200/80 dark:bg-indigo-400/30"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <h2 className="mt-6 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm text-pretty text-zinc-600 dark:text-zinc-400">{children}</p>
      {action}
    </div>
  </div>
)

const NotFound = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="grid flex-1 place-items-center px-6 pb-16">
    <div className="max-w-sm text-center">
      <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">404</p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  </div>
)

const OrgNotFound = ({ org }: { org: string }) => (
  <NotFound title={`No organization named ${org}`}>
    <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
      It does not exist, or your Forgejo account cannot see it.
    </p>
    <Link href={orgViewHref("board")} className={`${buttonClass.primary} mt-6`}>
      Choose an organization
    </Link>
  </NotFound>
)

const BoardNotFound = ({ org, defaultName }: { org: string; defaultName: string }) => (
  <NotFound title="There is no such board">
    <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
      Someone may have deleted it, or the address is not quite right.
    </p>
    <Link href={boardHref(org, DEFAULT_BOARD_ID)} className={`${buttonClass.primary} mt-6`}>
      Open {defaultName}
    </Link>
  </NotFound>
)

/** A text button inside a notice's sentence; on touch its hit area grows to 44px tall. */
const inlineAction =
  "relative font-medium pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-3 text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition hover:text-zinc-900 hover:decoration-zinc-500 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:text-zinc-100"

const FailedRepos = ({
  failures,
  named = false,
  action,
  onDismiss,
}: {
  failures: ReadonlyArray<{ readonly repo: string; readonly message: string }>
  named?: boolean
  action?:
    | { readonly label: string; readonly run: () => void; readonly pending?: boolean }
    | undefined
  onDismiss?: () => void
}) => (
  <>
    {named
      ? sentence(failures[0]?.message ?? "")
      : `${failures.map((failure) => `${failure.repo} (${failure.message})`).join(", ")}.`}
    {action !== undefined && (
      <>
        {" "}
        <button
          type="button"
          onClick={action.run}
          aria-disabled={action.pending || undefined}
          className={`${inlineAction} aria-disabled:opacity-60`}
        >
          {action.label}
        </button>
      </>
    )}
    {onDismiss !== undefined && (
      <>
        {action === undefined ? " " : <span aria-hidden="true"> · </span>}
        <button type="button" onClick={onDismiss} className={inlineAction}>
          Hide this
        </button>
      </>
    )}
  </>
)

const NoMatches = ({ query, onClear }: { query: string; onClear: () => void }) => (
  <div className="grid flex-1 place-items-center px-6 pb-16">
    <div className="max-w-sm text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
        <SearchIcon className="size-5" />
      </div>
      <h2 className="mt-5 text-base font-semibold tracking-tight">
        {query === "" ? "No cards match the filters" : `No cards match “${query}”`}
      </h2>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        Try other words or fewer filters.
      </p>
      <button type="button" onClick={onClear} className={`${buttonClass.secondary} mt-5`}>
        Clear filters
      </button>
    </div>
  </div>
)

const boardMenuItem =
  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 transition pointer-coarse:min-h-11 hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"

/** The board's quieter actions: refreshing, which also says when the board was read, and help. */
const BoardMenu = ({
  updated,
  refreshing,
  onRefresh,
  onShortcuts,
  className = "",
}: {
  /** When the board was last read, in words; null before it first loads. */
  updated: string | null
  refreshing: boolean
  onRefresh: () => void
  onShortcuts: () => void
  className?: string
}) => (
  <Popover
    align="end"
    chevron={false}
    focusFirstItem
    containerClass={`relative ${className}`}
    accessibleLabel={`Board options${updated === null ? "" : `. ${updated}`}`}
    triggerClass={buttonClass.icon}
    panelClass="w-60 p-1"
    label={
      refreshing ? (
        <RefreshIcon className="size-4 animate-spin" />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
          <circle cx="3.5" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.5" cy="8" r="1.25" />
        </svg>
      )
    }
  >
    {(close) => (
      <div role="menu" aria-label="Board options">
        <button
          type="button"
          role="menuitem"
          className={boardMenuItem}
          onClick={() => {
            close()
            onRefresh()
          }}
        >
          <RefreshIcon className="size-4 text-zinc-500 dark:text-zinc-400" />
          <span className="flex min-w-0 flex-1 flex-col">
            Refresh
            {updated !== null && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{updated}</span>
            )}
          </span>
          <span className="pointer-coarse:hidden">
            <Kbd>R</Kbd>
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={`${boardMenuItem} pointer-coarse:hidden`}
          onClick={() => {
            close()
            onShortcuts()
          }}
        >
          <KeyboardIcon className="size-4 text-zinc-500 dark:text-zinc-400" />
          <span className="flex-1">Keyboard shortcuts</span>
          <Kbd>?</Kbd>
        </button>
      </div>
    )}
  </Popover>
)

export const BoardPage = ({ org, board }: OrgViewParams) => {
  const [params] = useSearchParams()
  const [, navigate] = useLocation()
  const canonical = canonicalBoardHref(org, board, params)
  useEffect(() => {
    if (canonical !== null) navigate(canonical, { replace: true })
  }, [canonical, navigate])
  const boardId = boardIdFromPath(board)
  return <BoardView key={boardId} org={org} boardId={boardId} />
}

const BoardView = ({ org, boardId }: { org: string; boardId: string }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const viewer = useViewer()
  const now = useNow()
  const [, navigate] = useLocation()
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  // The search box updates at once; the board catches up without blocking the next keystroke.
  const searchText = useDeferredValue(filters.text)
  const boardFilters = { ...filters, text: searchText }
  const selectedRef = params.get(CARD_PARAM)
  const [dragging, setDragging] = useState(false)
  const [dismissedFailures, setDismissedFailures] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsMode | null>(null)
  const [collapsed, setCollapsed] = useState(() => readCollapsed(collapsedKey(org, boardId)))
  const [composing, setComposing] = useState<string | null>(null)
  const [composerRepo, setComposerRepo] = useState(() => storage.read(composerRepoKey(org)))
  const searchInput = useRef<HTMLInputElement>(null)
  // Where focus goes when the shortcuts dialog closes and what had it before is gone: the control
  // it was opened from, or the board's options after a key press from the page.
  const shortcutsOpener = useRef<HTMLElement | null>(null)
  const openShortcuts = () => {
    const active = document.activeElement
    shortcutsOpener.current =
      active instanceof HTMLElement && active !== document.body
        ? active
        : document.querySelector<HTMLElement>('button[aria-label^="Board options"]')
    setShortcutsOpen(true)
  }

  const repos = useQuery({ queryKey: ["org-repos", org], queryFn: () => fetchOrgRepos(org) })
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })
  const boards = useBoardList(org)
  const boardWrites = useBoardWrites(org)

  const boardKey = boardQueryKey(org, boardId)
  const writeKey = boardWriteKey(org)
  const { holdReads, refetchAfterWrites } = useBoardReads(org)
  // A refetch that lands during a drag or before a write is stored would undo it on screen.
  const moving = useIsMutating({ mutationKey: writeKey }) > 0
  const settled = !dragging && !moving
  const board = useQuery({
    queryKey: boardKey,
    queryFn: () => fetchBoard(org, boardId),
    refetchInterval: settled ? REFRESH_MS : false,
    refetchOnWindowFocus: settled,
  })
  const boardMissing =
    board.error instanceof RequestFailed && board.error.code === "board_not_found"
  const orgMissing =
    board.error instanceof RequestFailed &&
    board.error.status === 404 &&
    board.error.code === undefined

  const loaded = board.isSuccess
  useEffect(() => {
    if (loaded) rememberBoard(org, boardId)
  }, [loaded, org, boardId])
  const loadedBefore = board.data !== undefined
  useEffect(() => {
    if (!boardMissing) return
    const wasLast = forgetBoard(org, boardId)
    if (!wasLast || loadedBefore) return
    toast({
      tone: "info",
      title: "The board you used last is gone",
      detail: "Someone deleted it, so Tabulo opened the default board.",
    })
    navigate(boardHref(org, DEFAULT_BOARD_ID), { replace: true })
  }, [boardMissing, org, boardId, loadedBefore, toast, navigate])

  const setCardParam = (value: string | null, replace: boolean) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === null) next.delete(CARD_PARAM)
        else next.set(CARD_PARAM, value)
        return next
      },
      { replace },
    )

  const columnTitle = (key: string) =>
    board.data?.columns.find((column) => column.key === key)?.title ?? key

  // Writes wait while the browser is offline; one notice says so and goes away once it is back.
  const online = useOnline()
  const dismissOffline = useRef<(() => void) | null>(null)
  const offlineNotice = (detail: string) => {
    dismissOffline.current?.()
    dismissOffline.current = toast({ tone: "info", title: "You are offline", detail })
  }
  useEffect(() => {
    if (online) {
      dismissOffline.current?.()
      dismissOffline.current = null
    }
  }, [online])

  // Cards whose move Forgejo has not confirmed yet, for example while offline.
  const saving = new Set(
    useMutationState({
      filters: { mutationKey: [...writeKey, "move"], status: "pending" },
      select: (mutation) => (mutation.state.variables as { cardMove: CardMove }).cardMove.key,
    }),
  )

  const move = useMutation({
    mutationKey: [...writeKey, "move"],
    mutationFn: ({
      request,
    }: {
      request: MoveCardRequest
      cardMove: CardMove
      before: BoardCard
      undo: CardMove | null
    }) => moveCard(request),
    onSuccess: ({ card, orderSaved }, { request, undo }) => {
      queryClient.setQueryData<Board>(boardKey, (current) =>
        current === undefined ? current : replaceCard(current, card.key, () => card),
      )
      if (!orderSaved) {
        toast({
          tone: "warning",
          title: "Moved, but its place in the column was not saved",
          detail: "Others may see the card elsewhere in the column.",
          key: aboutCard(card),
        })
        return
      }
      if (request.fromColumn === request.toColumn) return
      toast({
        tone: "success",
        title: (
          <>
            Moved <IssueRef repo={card.repo} number={card.number} />{" "}
            {undo === null ? "back to" : "to"} {columnTitle(request.toColumn)}
          </>
        ),
        detail: card.title,
        key: aboutCard(card),
        ...(undo === null ? {} : { action: { label: "Undo", run: () => startMove(undo, null) } }),
      })
    },
    onError: (error, { before, request, cardMove, undo }) => {
      // A partly applied move changed Forgejo, so the refetch below shows the truth; putting the
      // card back would show a state that no longer exists.
      if (error instanceof RequestFailed && error.code === "move_partly_applied") {
        toast({
          tone: "error",
          title: "The move was only partly applied",
          detail: `${sentence(error.message)} The board shows the issue as it is now.`,
          key: aboutCard(request),
        })
        return
      }
      queryClient.setQueryData<Board>(boardKey, (current) =>
        current === undefined ? current : revertMove(current, before),
      )
      if (error instanceof RequestFailed && error.code === "board_changed") {
        toast({
          tone: "warning",
          title: "Someone changed the board meanwhile",
          detail: "The card did not move. The board has been reloaded; try again.",
          key: aboutCard(request),
        })
        return
      }
      toast({
        tone: "error",
        title: (
          <>
            Could not move <IssueRef repo={request.repo} number={request.number} />
          </>
        ),
        detail: error.message,
        key: aboutCard(request),
        action: { label: "Retry", run: () => startMove(cardMove, undo) },
      })
    },
    onSettled: refetchAfterWrites,
  })

  /** Moves a card and offers to put it back where it was, unless `undo` is null. */
  const startMove = (cardMove: CardMove, undo?: CardMove | null) => {
    const current = queryClient.getQueryData<Board>(boardKey)
    const card = current?.cards.find((candidate) => candidate.key === cardMove.key)
    if (current === undefined || card === undefined) return
    if (!navigator.onLine) {
      offlineNotice(`${card.repo}#${card.number} moves in Forgejo once you are back online.`)
    }
    const column = columnCards(current.cards, card.column)
    const index = column.findIndex((candidate) => candidate.key === card.key)
    const back: CardMove = {
      key: card.key,
      toColumn: card.column,
      afterKey: column[index - 1]?.key ?? null,
      beforeKey: column[index + 1]?.key ?? null,
    }
    // The board shows the move in the same render that ends the drag, so the dropped card's
    // overlay settles into its new place rather than flying back to the old one.
    void holdReads()
    queryClient.setQueryData<Board>(
      boardKey,
      applyMove(current, cardMove, new Date().toISOString()),
    )
    move.mutate({
      cardMove,
      before: card,
      undo: undo === undefined ? back : undo,
      request: {
        org: current.org,
        repo: card.repo,
        number: card.number,
        fromColumn: card.column,
        toColumn: cardMove.toColumn,
        afterKey: cardMove.afterKey,
        beforeKey: cardMove.beforeKey,
      },
    })
  }

  const moveToTop = (card: BoardCard, toColumn: string) => {
    const current = queryClient.getQueryData<Board>(boardKey)
    if (current === undefined || toColumn === card.column) return
    const first = columnCards(current.cards, toColumn).find(
      (candidate) => candidate.key !== card.key && visible(candidate),
    )
    startMove({ key: card.key, toColumn, afterKey: null, beforeKey: first?.key ?? null })
  }

  const putCard = (card: BoardCard) =>
    queryClient.setQueryData<Board>(boardKey, (current) =>
      current === undefined
        ? current
        : current.cards.some((candidate) => candidate.key === card.key)
          ? replaceCard(current, card.key, () => card)
          : { ...current, cards: [...current.cards, card] },
    )

  const create = useMutation({
    mutationKey: [...writeKey, "create"],
    mutationFn: createCard,
    onMutate: holdReads,
    onSettled: refetchAfterWrites,
    onSuccess: ({ card, orderSaved }) => {
      putCard(card)
      toast({
        tone: orderSaved ? "success" : "warning",
        title: (
          <>
            Created <IssueRef repo={card.repo} number={card.number} />
          </>
        ),
        key: aboutCard(card),
        detail: orderSaved
          ? card.title
          : "Its place at the top of the column was not saved, so it may show lower down.",
        action: { label: "Open", run: () => latestActions.current?.open(card) },
      })
    },
    onError: (error) =>
      toast({ tone: "error", title: "Could not create the issue", detail: error.message }),
  })

  const update = useMutation({
    mutationKey: [...writeKey, "update"],
    mutationFn: ({ run }: CardUpdate) => run(),
    onMutate: holdReads,
    onSettled: refetchAfterWrites,
    onSuccess: ({ card }, { done, issue, undo }) => {
      putCard(card)
      toast({
        tone: "success",
        title: done,
        key: aboutCard(card),
        ...(undo === undefined
          ? {}
          : { action: { label: "Undo", run: () => update.mutate({ ...undo, issue }) } }),
      })
    },
    onError: (error, variables) =>
      toast({
        tone: "error",
        title: `Could not change ${variables.issue}`,
        key: `card:${variables.issue}`,
        detail: error.message,
        action: { label: "Retry", run: () => update.mutate(variables) },
      }),
  })

  const toggleAssigned = (card: BoardCard) => {
    const assigned = card.assignees.some((assignee) => assignee.login === viewer.login)
    const set = (to: boolean) => () =>
      setAssignee({ org, repo: card.repo, number: card.number, login: viewer.login, assigned: to })
    update.mutate({
      run: set(!assigned),
      undo: {
        run: set(assigned),
        done: assigned
          ? `Assigned ${card.repo}#${card.number} to you`
          : `Unassigned you from ${card.repo}#${card.number}`,
      },
      issue: `${card.repo}#${card.number}`,
      done: assigned
        ? `Unassigned you from ${card.repo}#${card.number}`
        : `Assigned ${card.repo}#${card.number} to you`,
    })
  }

  const toggleCollapsed = (column: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      storage.write(collapsedKey(org, boardId), JSON.stringify([...next]))
      return next
    })

  const copyLink = useCallback(
    (card: BoardCard) => {
      navigator.clipboard.writeText(card.url).then(
        () => toast({ tone: "info", title: "Issue link copied", detail: card.url }),
        () => toast({ tone: "error", title: "Could not copy the link", detail: card.url }),
      )
    },
    [toast],
  )

  const visible = (card: BoardCard) => matchesFilters(card, boardFilters, viewer.login)
  // A board that answered 404 keeps its last answer in the cache, which nothing may act on.
  const data = isNotFound(board.error) ? undefined : board.data
  const archived = new Set(
    (repos.data ?? []).filter((repo) => repo.archived).map((repo) => repo.name),
  )
  const failed = new Set((data?.failedRepos ?? []).map((failure) => failure.repo))
  const creatableRepos = (data?.board.repos ?? []).filter(
    (repo) => !archived.has(repo) && !failed.has(repo),
  )
  const canCreate = data?.viewerCanArrange === true && creatableRepos.length > 0
  const firstCreatable = data?.columns.find((column) => column._tag !== "Done")

  const selectedCard =
    selectedRef === null || data === undefined
      ? undefined
      : data.cards.find((card) => cardRef(card).toLowerCase() === selectedRef.toLowerCase())
  // The open card stays in the list even when a filter hides it, so stepping starts from it.
  const selectedColumn =
    selectedCard === undefined || data === undefined
      ? []
      : columnCards(data.cards, selectedCard.column).filter(
          (card) => visible(card) || card.key === selectedCard.key,
        )
  const selectedIndex =
    selectedCard === undefined
      ? -1
      : selectedColumn.findIndex((card) => card.key === selectedCard.key)
  const step = (offset: -1 | 1) => {
    const target = selectedColumn[selectedIndex + offset]
    if (target !== undefined) setCardParam(cardRef(target), true)
  }

  // Opening the panel adds a history entry, so Back closes it. Closing goes back to that entry
  // only if the board's address is unchanged since; otherwise it would undo a new filter. A card
  // that arrives through a new entry, from the board or from elsewhere such as the command
  // palette, counts as opened here; one in the address on load, or reached with Back or Forward,
  // does not, since the entry before it may not be this board.
  const pushedFrom = useRef<string | null>(null)
  const boardAddress = () => {
    const next = new URLSearchParams(window.location.search)
    next.delete(CARD_PARAM)
    return next.toString()
  }
  const shownRef = useRef(selectedRef)
  // The address Back or Forward last went to. Captured, so it is known before the router's own
  // listener re-renders the board and runs the effect below.
  const popped = useRef<string | null>(null)
  useEffect(() => {
    const listener = () => {
      popped.current = window.location.href
    }
    window.addEventListener("popstate", listener, { capture: true })
    return () => window.removeEventListener("popstate", listener, { capture: true })
  }, [])
  useEffect(() => {
    const previous = shownRef.current
    shownRef.current = selectedRef
    const viaHistory = popped.current === window.location.href
    popped.current = null
    if (selectedRef === null) pushedFrom.current = null
    else if (previous === null && !viaHistory) pushedFrom.current = boardAddress()
  })
  const openPanel = (card: BoardCard) => setCardParam(cardRef(card), selectedRef !== null)
  const closePanel = () => {
    const key = selectedCard?.key
    if (pushedFrom.current !== null && pushedFrom.current === boardAddress()) {
      window.history.back()
    } else {
      setCardParam(null, true)
    }
    pushedFrom.current = null
    if (key !== undefined) {
      document
        .querySelector<HTMLElement>(`[data-card-key="${CSS.escape(key)}"] a[data-card-link]`)
        ?.focus()
    }
  }

  // A card in the address that the board does not have, such as a closed issue's old link.
  useEffect(() => {
    if (selectedRef === null || data === undefined || selectedCard !== undefined) return
    // A repository that failed to load this time keeps its card open until it loads again.
    const repo = selectedRef.split("#")[0]?.toLowerCase()
    if (data.failedRepos.some((failure) => failure.repo.toLowerCase() === repo)) return
    toast({
      tone: "warning",
      title: `${selectedRef} is not on this board`,
      detail: "It may be closed, in a repository the board does not show, or in a hidden column.",
    })
    setCardParam(null, true)
  })

  // Escape or Cancel returns focus to the control that opened the composer; without one, such as
  // after the N key, to the column's + button.
  const composerOpener = useRef<HTMLElement | null>(null)
  const openComposer = (column: string, opener: HTMLElement | null = null) => {
    composerOpener.current = opener
    setComposing(column)
    if (collapsed.has(column)) toggleCollapsed(column)
  }

  const toggleMine = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        const assignees = next.getAll(FILTER_PARAMS.assignee)
        next.delete(FILTER_PARAMS.assignee)
        const toggled = assignees.includes(ME)
          ? assignees.filter((assignee) => assignee !== ME)
          : [ME, ...assignees]
        for (const assignee of toggled) next.append(FILTER_PARAMS.assignee, assignee)
        return next
      },
      { replace: true },
    )

  // Single-key shortcuts; BOARD_SHORTCUTS lists them.
  usePageShortcuts(BOARD_SHORTCUTS)
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {})
  shortcuts.current = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
    if (isTypingTarget(event.target) || shortcutsOpen || dragging) return
    if (document.querySelector("dialog[open]") !== null) return
    const key = event.key
    if (key === "?") openShortcuts()
    else if (key === "/") searchInput.current?.focus()
    else if (key === "r" || key === "R") void board.refetch()
    else if (key === "m" || key === "M") toggleMine()
    else if ((key === "n" || key === "N") && canCreate && firstCreatable !== undefined) {
      openComposer(firstCreatable.key)
    } else if (selectedCard !== undefined && (key === "j" || key === "J")) step(1)
    else if (selectedCard !== undefined && (key === "k" || key === "K")) step(-1)
    else if (selectedCard !== undefined && (key === "o" || key === "O")) {
      window.open(selectedCard.url, "_blank", "noreferrer")
    } else if (
      selectedCard !== undefined &&
      (key === "a" || key === "A") &&
      selectedCard.state === "open" &&
      selectedCard.readOnlyReason === null
    ) {
      toggleAssigned(selectedCard)
    } else if (selectedCard !== undefined && key === "Escape") closePanel()
    else return
    event.preventDefault()
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event)
    document.addEventListener("keydown", listener)
    return () => document.removeEventListener("keydown", listener)
  }, [])

  // Cards are memoized, so they get one actions object for good that calls the latest handlers.
  const latestActions = useRef<CardActions | null>(null)
  latestActions.current = {
    open: openPanel,
    moveTo: moveToTop,
    toggleAssigned,
    copyLink,
  }
  const actions = useMemo<CardActions>(
    () => ({
      open: (card) => latestActions.current?.open(card),
      moveTo: (card, column) => latestActions.current?.moveTo(card, column),
      toggleAssigned: (card) => latestActions.current?.toggleAssigned(card),
      copyLink: (card) => latestActions.current?.copyLink(card),
    }),
    [],
  )
  // A card's link keeps the board's filters, but not the search text, so typing does not re-render
  // every card.
  const hrefBase = (() => {
    const next = new URLSearchParams(params)
    next.delete(CARD_PARAM)
    next.delete(FILTER_PARAMS.text)
    return next.toString()
  })()

  const allFailed =
    data !== undefined &&
    data.failedRepos.length > 0 &&
    data.failedRepos.length === data.board.repos.length
  const orgTitle =
    orgs.data?.find((candidate) => candidate.name.toLowerCase() === org.toLowerCase())?.fullName ||
    org
  const canChangeBoards =
    data?.viewerCanArrange ??
    orgs.data?.some((candidate) => candidate.name.toLowerCase() === org.toLowerCase()) === true
  const canEditBoard = data?.viewerCanArrange === true
  const editBoard = (focus?: "repos" | "columns") => {
    if (data !== undefined) setSettings({ _tag: "Edit", board: data, ...(focus ? { focus } : {}) })
  }
  const removeFailed = () => {
    // A second update would go against the version the first one replaced and answer 409.
    if (data === undefined || boardWrites.update.isPending) return
    const failed = new Set(failures.map((failure) => failure.repo.toLowerCase()))
    const loading = data.board.repos.filter((repo) => !failed.has(repo.toLowerCase()))
    boardWrites.update.mutate(
      { request: toUpdateRequest(org, data, { ...draftOf(data), repos: loading }) },
      {
        onSuccess: (saved) =>
          toast({
            tone: "success",
            title: `Removed ${failures.length === 1 ? failures[0]?.repo : `${failures.length} repositories`} from ${saved.name}`,
          }),
        onError: (error) => {
          if (error instanceof RequestFailed && error.code === "board_changed") {
            void board.refetch()
            toast({
              tone: "warning",
              title: "Someone changed the board meanwhile",
              detail: "Nothing was removed. The board has been reloaded; try again.",
            })
          } else {
            toast({ tone: "error", title: "Could not change the board", detail: error.message })
          }
        },
      },
    )
  }
  const clearFilters = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const param of Object.values(FILTER_PARAMS)) next.delete(param)
        return next
      },
      { replace: true },
    )

  const failures = data?.failedRepos ?? []
  const failureId = failures.map((failure) => `${failure.repo}:${failure.message}`).join("|")
  const filtered = isFiltered(boardFilters)
  const shownCount = data === undefined ? 0 : data.cards.filter(visible).length
  const onlyDefaultColumns = data?.allColumns.every((column) => column._tag !== "Status")
  const composerTarget =
    composerRepo !== null && creatableRepos.includes(composerRepo)
      ? composerRepo
      : creatableRepos[0]
  const loadedAt = new Date(board.dataUpdatedAt).toISOString()
  // After a failed refresh the cards are older than the last attempt, so say when they were read.
  const refreshFailed = data !== undefined && board.isError && !allFailed
  const updated =
    data === undefined
      ? null
      : board.isFetching
        ? "Refreshing…"
        : refreshFailed
          ? `Refresh failed, last loaded ${relativeTime(loadedAt, now)}`
          : `Updated ${relativeTime(loadedAt, now)}`
  // On a phone the board's options sit beside Filters, which leaves the organization's name room.
  const filtersShown =
    data !== undefined && !allFailed && data.board.repos.length > 0 && data.columns.length > 0

  const atBoardLimit = (boards.data?.boards.length ?? 0) >= MAX_BOARDS
  usePageCommands(
    data === undefined
      ? NO_COMMANDS
      : boardCommands({
          filtersShown,
          cards: data.cards,
          filters,
          newIssueColumn:
            canCreate && firstCreatable !== undefined ? columnTitle(firstCreatable.key) : null,
          newIssue: () => {
            if (firstCreatable !== undefined) openComposer(firstCreatable.key)
          },
          toggleMine,
          setFilter: (filter, values) =>
            setParams((current) => withFilter(current, filter, values), { replace: true }),
          clearFilters,
          focusSearch: afterPaletteCloses(() => searchInput.current?.focus()),
          refresh: () => void board.refetch(),
          updated: updated ?? "",
          boardName: data.board.name,
          editBoard: canEditBoard ? afterPaletteCloses(() => editBoard()) : null,
          newBoard:
            canChangeBoards && !atBoardLimit
              ? afterPaletteCloses(() => setSettings({ _tag: "Create" }))
              : null,
        }),
  )

  return (
    <RepoPaletteProvider repos={data?.board.repos ?? []}>
      <main className="flex h-[calc(100dvh-3.5rem-1px-var(--tab-bar-height))] min-h-0 flex-col">
        <h1 className="sr-only">Board for {orgTitle}</h1>
        {/*
          One row on a wide screen: scope, search and filters, then the board's actions. Narrower,
          the filters take a row of their own under the scope and actions; on a phone the board's
          options move down beside them.
        */}
        <div
          className={`grid items-center gap-x-2 gap-y-2.5 px-4 pt-3 pb-3 sm:px-6 ${
            filtersShown
              ? "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] min-[84rem]:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
              : "grid-cols-[minmax(0,1fr)_auto]"
          }`}
        >
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5">
            <OrgSwitcher org={org} view="board" />
            {!orgMissing && (
              <>
                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                  /
                </span>
                <BoardSwitcher
                  org={org}
                  boardId={boardId}
                  name={boardMissing ? "No such board" : data?.board.name}
                  onEdit={canEditBoard ? () => editBoard() : undefined}
                  onCreate={canChangeBoards ? () => setSettings({ _tag: "Create" }) : undefined}
                />
              </>
            )}
          </div>
          {filtersShown && (
            <>
              <BoardFiltersBar
                cards={data.cards}
                filters={filters}
                setParams={setParams}
                searchInput={searchInput}
                shown={shownCount}
                total={data.cards.length}
                className="col-start-1 row-start-2 sm:col-span-3 min-[84rem]:col-span-1 min-[84rem]:col-start-2 min-[84rem]:row-start-1 min-[84rem]:ml-2"
              />
              <BoardMenu
                updated={updated}
                refreshing={board.isFetching}
                onRefresh={() => void board.refetch()}
                onShortcuts={openShortcuts}
                className="col-start-2 row-start-2 self-start sm:row-start-1 sm:self-center min-[84rem]:col-start-3"
              />
            </>
          )}
          <div
            className={`col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-1 ${
              filtersShown ? "sm:col-start-3 min-[84rem]:col-start-4" : ""
            }`}
          >
            {!online && (
              <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
                Offline
              </span>
            )}
            {!filtersShown && !boardMissing && !orgMissing && (
              <BoardMenu
                updated={updated}
                refreshing={board.isFetching}
                onRefresh={() => void board.refetch()}
                onShortcuts={openShortcuts}
              />
            )}
            {canCreate && firstCreatable !== undefined && (
              <button
                type="button"
                onClick={(event) => openComposer(firstCreatable.key, event.currentTarget)}
                className={`${buttonClass.primary} ${touchTarget} ml-1 max-sm:w-8 max-sm:px-0`}
                title="New issue (N)"
              >
                <PlusIcon className="size-4" />
                <span className="max-sm:sr-only">New issue</span>
              </button>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {board.isFetching ? "Refreshing board" : ""}
          </p>
        </div>

        {refreshFailed && (
          <ErrorNotice
            tone="warning"
            title="Could not refresh the board"
            onRetry={() => void board.refetch()}
            retrying={board.isFetching}
            className="mx-4 mb-3 sm:mx-6"
          >
            {sentence(board.error?.message ?? "")} The cards shown were loaded{" "}
            <time dateTime={loadedAt} title={absoluteTime(loadedAt)}>
              {relativeTime(loadedAt, now)}
            </time>
            .
          </ErrorNotice>
        )}
        {failures.length > 0 &&
          failures.length < (data?.board.repos.length ?? 0) &&
          dismissedFailures !== failureId && (
            <ErrorNotice
              tone="warning"
              title="Could not load some repositories"
              onRetry={() => void board.refetch()}
              retrying={board.isFetching}
              className="mx-4 mb-3 sm:mx-6"
            >
              <FailedRepos
                failures={failures}
                action={
                  canChangeBoards
                    ? {
                        label: boardWrites.update.isPending
                          ? "Removing…"
                          : `Remove ${failures.length === 1 ? "it" : "them"} from the board`,
                        run: removeFailed,
                        pending: boardWrites.update.isPending,
                      }
                    : undefined
                }
                onDismiss={() => setDismissedFailures(failureId)}
              />
            </ErrorNotice>
          )}
        {data !== undefined && !data.viewerCanArrange && (
          <Notice>
            You can view this board. Only members of {data.org} can move cards, add issues, and
            change boards.
          </Notice>
        )}
        {onlyDefaultColumns && (
          <Notice>
            <span className="flex items-center gap-1.5">
              <ColumnsIcon className="size-4 text-zinc-400" />
              Add exclusive labels such as{" "}
              <code className="font-mono text-xs">Status/In Progress</code> to {org} in Forgejo to
              get more columns between Todo and Done.
            </span>
          </Notice>
        )}

        {/* The board area, under the toolbar: on a wide screen the card panel sits inside it. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {orgMissing ? (
            <OrgNotFound org={org} />
          ) : boardMissing ? (
            <BoardNotFound
              org={org}
              defaultName={
                boards.data?.boards.find((listed) => listed.id === DEFAULT_BOARD_ID)?.name ??
                DEFAULT_BOARD_NAME
              }
            />
          ) : data === undefined ? (
            board.isError ? (
              <ErrorNotice
                title="Could not load the board"
                onRetry={() => void board.refetch()}
                retrying={board.isFetching}
                className="mx-4 sm:mx-6"
              >
                {board.error.message}
              </ErrorNotice>
            ) : (
              <div className="min-h-0 flex-1">
                <BoardSkeleton />
              </div>
            )
          ) : allFailed ? (
            <ErrorNotice
              title={
                data.failedRepos.length === 1
                  ? `Could not load ${data.failedRepos[0]?.repo}`
                  : "Could not load any of the repositories"
              }
              onRetry={() => void board.refetch()}
              retrying={board.isFetching}
              className="mx-4 sm:mx-6"
            >
              <FailedRepos
                failures={data.failedRepos}
                named={data.failedRepos.length === 1}
                action={
                  canChangeBoards
                    ? { label: "Choose other repositories", run: () => editBoard("repos") }
                    : undefined
                }
              />
            </ErrorNotice>
          ) : data.board.repos.length === 0 ? (
            data.board.unreadableRepos > 0 ? (
              <EmptyBoard
                title="You cannot read this board's repositories"
                action={
                  canChangeBoards && (
                    <button
                      type="button"
                      onClick={() => editBoard("repos")}
                      className={`${buttonClass.secondary} mt-6`}
                    >
                      Edit board
                    </button>
                  )
                }
              >
                {data.board.name} shows{" "}
                {data.board.unreadableRepos === 1
                  ? "1 repository"
                  : `${data.board.unreadableRepos} repositories`}{" "}
                that your Forgejo account cannot read.
              </EmptyBoard>
            ) : (
              <EmptyBoard
                title="This board has no repositories yet"
                action={
                  canChangeBoards && (
                    <button
                      type="button"
                      onClick={() => editBoard("repos")}
                      className={`${buttonClass.primary} mt-6`}
                    >
                      Choose repositories
                    </button>
                  )
                }
              >
                {canChangeBoards
                  ? `Choose the repositories of ${data.board.name}. Everyone who opens it sees their issues.`
                  : `A member of ${orgTitle} can choose its repositories.`}
              </EmptyBoard>
            )
          ) : data.columns.length === 0 ? (
            <EmptyBoard
              title="Every column of this board is hidden"
              action={
                canChangeBoards && (
                  <button
                    type="button"
                    onClick={() => editBoard("columns")}
                    className={`${buttonClass.primary} mt-6`}
                  >
                    Edit board
                  </button>
                )
              }
            >
              {canChangeBoards
                ? "Show at least one column in the board's settings."
                : `A member of ${orgTitle} can show them again.`}
            </EmptyBoard>
          ) : filtered && shownCount === 0 && data.cards.length > 0 ? (
            <NoMatches query={boardFilters.text.trim()} onClear={clearFilters} />
          ) : (
            <div className="min-h-0 flex-1">
              <BoardColumns
                board={data}
                saving={saving}
                panelOpen={selectedCard !== undefined}
                visible={visible}
                filtered={filtered}
                viewer={viewer.login}
                selectedKey={selectedCard?.key ?? null}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                composing={canCreate ? composing : null}
                onCompose={openComposer}
                canCreate={canCreate}
                composer={
                  composing !== null &&
                  composerTarget !== undefined && (
                    <CardComposer
                      key={composing}
                      columnTitle={columnTitle(composing)}
                      draft={drafts.read(titleDraftKey(org, composing))}
                      onDraftChange={(title) => drafts.write(titleDraftKey(org, composing), title)}
                      repos={creatableRepos}
                      repo={composerTarget}
                      onRepoChange={(repo) => {
                        setComposerRepo(repo)
                        storage.write(composerRepoKey(org), repo)
                      }}
                      onClose={() => {
                        const column = composing
                        const opener = composerOpener.current
                        setComposing(null)
                        requestAnimationFrame(() =>
                          (opener?.isConnected
                            ? opener
                            : document.querySelector<HTMLElement>(
                                `button[aria-label="New issue in ${CSS.escape(columnTitle(column))}"]`,
                              )
                          )?.focus(),
                        )
                      }}
                      onCreate={async (repo, title) => {
                        if (!navigator.onLine) {
                          offlineNotice(
                            "The new issue is created in Forgejo once you are back online.",
                          )
                        }
                        await create.mutateAsync({ org: data.org, repo, title, column: composing })
                      }}
                    />
                  )
                }
                actions={actions}
                hrefBase={hrefBase}
                onMove={(cardMove) => startMove(cardMove)}
                onDragChange={(isDragging) => {
                  setDragging(isDragging)
                  if (isDragging) void queryClient.cancelQueries({ queryKey: boardKey })
                }}
              />
            </div>
          )}

          {data !== undefined && selectedCard !== undefined && (
            <CardPanel
              org={data.org}
              card={selectedCard}
              columns={data.columns}
              viewer={viewer.login}
              movable={data.viewerCanArrange && selectedCard.readOnlyReason === null}
              position={{
                index: selectedIndex,
                count: selectedColumn.length,
                hiddenByFilters: !visible(selectedCard),
              }}
              onStep={step}
              onMoveTo={(column) => moveToTop(selectedCard, column)}
              onToggleAssigned={() => toggleAssigned(selectedCard)}
              onUpdate={(change) => update.mutate(change)}
              onCommented={putCard}
              holdReads={holdReads}
              updating={update.isPending}
              onCopyLink={() => copyLink(selectedCard)}
              onClose={closePanel}
            />
          )}
        </div>
        {settings !== null && (
          <BoardSettingsDialog org={org} mode={settings} onClose={() => setSettings(null)} />
        )}
        <ShortcutsDialog
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
          returnFocus={shortcutsOpener}
        />
      </main>
    </RepoPaletteProvider>
  )
}
