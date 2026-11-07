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
import { Link, useSearchParams } from "wouter"
import type { Board, BoardCard, CardUpdateResult, MoveCardRequest } from "../../shared/api.ts"
import {
  createCard,
  fetchBoard,
  fetchOrgRepos,
  fetchOrgs,
  moveCard,
  RequestFailed,
  setAssignee,
} from "../api.ts"
import { relativeTime } from "../format.ts"
import { useViewer } from "../session.ts"
import {
  AlertIcon,
  ColumnsIcon,
  InfoIcon,
  KeyboardIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from "../ui/icons.tsx"
import { buttonClass, isTypingTarget } from "../ui/primitives.tsx"
import { RepoPaletteProvider } from "../ui/repo-palette.tsx"
import { useToast } from "../ui/toast.tsx"
import type { CardActions } from "./BoardCardView.tsx"
import { BoardColumns } from "./BoardColumns.tsx"
import { BoardFiltersBar } from "./BoardFiltersBar.tsx"
import {
  applyMove,
  type CardMove,
  columnCards,
  FILTER_PARAMS,
  isFiltered,
  ME,
  matchesFilters,
  readFilters,
  replaceCard,
} from "./board-view.ts"
import { CardComposer } from "./CardComposer.tsx"
import { CardPanel } from "./CardPanel.tsx"
import { ORGS, OrgSwitcher } from "./OrgPicker.tsx"
import { RepoPicker } from "./RepoPicker.tsx"
import { ShortcutsDialog } from "./ShortcutsDialog.tsx"

const REFRESH_MS = 60_000
// The server's limit on repositories per board.
const MAX_BOARD_REPOS = 20
/** The last board the browser showed, which the header's Board link returns to. */
export const LAST_BOARD_KEY = "tabulo.board.last"

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

const reposKey = (org: string) => `tabulo.board.repos.${org.toLowerCase()}`
const collapsedKey = (org: string) => `tabulo.board.collapsed.${org.toLowerCase()}`
const composerRepoKey = (org: string) => `tabulo.board.new-issue-repo.${org.toLowerCase()}`

const readCollapsed = (org: string): ReadonlySet<string> => {
  try {
    const parsed: unknown = JSON.parse(storage.read(collapsedKey(org)) ?? "[]")
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

const Notice = ({
  tone,
  children,
  onDismiss,
}: {
  tone: "warning" | "info" | "error"
  children: ReactNode
  onDismiss?: () => void
}) => (
  <div
    role={tone === "info" ? "status" : "alert"}
    className={`mx-4 mb-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm sm:mx-6 ${
      tone === "error"
        ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
    }`}
  >
    {tone === "info" ? (
      <InfoIcon className="mt-0.5 size-4 text-zinc-400" />
    ) : (
      <AlertIcon className="mt-0.5 size-4 opacity-70" />
    )}
    <div className="min-w-0 flex-1">{children}</div>
    {onDismiss !== undefined && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-my-0.5 -mr-1 grid size-6 shrink-0 place-items-center rounded-md opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
      >
        <XIcon className="size-3.5" />
      </button>
    )}
  </div>
)

const BoardSkeleton = () => (
  <div className="flex h-full gap-3 overflow-hidden px-4 pb-4 sm:px-6" aria-hidden="true">
    {[5, 3, 4, 2, 3].map((count, column) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        key={column}
        className="flex min-w-[14.5rem] flex-1 flex-col gap-2 rounded-2xl bg-zinc-100/80 p-2 dark:bg-zinc-900/80"
      >
        <div className="mx-1.5 my-2.5 h-4 w-24 animate-shimmer rounded bg-zinc-200 dark:bg-zinc-800" />
        {Array.from({ length: count }, (_, card) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            key={card}
            className="h-24 animate-shimmer rounded-xl border border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            style={{ animationDelay: `${(column + card) * 80}ms` }}
          />
        ))}
      </div>
    ))}
  </div>
)

const EmptyBoard = ({ onChoose }: { onChoose: () => void }) => (
  <div className="grid flex-1 place-items-center px-6 pb-16">
    <div className="max-w-sm text-center">
      <div className="mx-auto flex h-20 w-28 items-end justify-center gap-1.5 rounded-2xl bg-gradient-to-b from-indigo-50 to-white p-3 ring-1 ring-indigo-100 dark:from-indigo-500/10 dark:to-transparent dark:ring-indigo-500/20">
        {[70, 45, 58].map((height) => (
          <span
            key={height}
            className="w-6 rounded-md bg-indigo-200/80 dark:bg-indigo-400/30"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <h2 className="mt-6 text-lg font-semibold tracking-tight">Build your board</h2>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        Choose the repositories whose issues the board shows. Tabulo remembers your choice, and the
        address keeps it for sharing.
      </p>
      <button type="button" onClick={onChoose} className={`${buttonClass.primary} mt-6`}>
        Choose repositories
      </button>
    </div>
  </div>
)

const OrgNotFound = ({ org }: { org: string }) => (
  <div className="grid flex-1 place-items-center px-6 pb-16">
    <div className="max-w-sm text-center">
      <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">404</p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">No organization named {org}</h2>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        It does not exist, or your Forgejo account cannot see it.
      </p>
      <Link href="/board" className={`${buttonClass.primary} mt-6`}>
        Choose an organization
      </Link>
    </div>
  </div>
)

/** A centered state for something that went wrong, with what to do about it. */
const Problem = ({
  title,
  detail,
  actions,
}: {
  title: string
  detail: ReactNode
  actions: ReactNode
}) => (
  <div className="grid flex-1 place-items-center px-6 pb-16">
    <div role="alert" className="max-w-md text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-500/10">
        <AlertIcon className="size-5" />
      </div>
      <h2 className="mt-5 text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{detail}</div>
      <div className="mt-5 flex justify-center gap-2">{actions}</div>
    </div>
  </div>
)

const ReposFailed = ({
  failures,
  onRemove,
  onRetry,
}: {
  failures: ReadonlyArray<{ readonly repo: string; readonly message: string }>
  onRemove: () => void
  onRetry: () => void
}) => (
  <Problem
    title={
      failures.length === 1
        ? `${failures[0]?.repo} did not load`
        : "These repositories did not load"
    }
    detail={
      failures.length === 1 ? (
        `${failures[0]?.message}.`
      ) : (
        <ul className="space-y-0.5">
          {failures.map((failure) => (
            <li key={failure.repo}>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{failure.repo}</span>:{" "}
              {failure.message}
            </li>
          ))}
        </ul>
      )
    }
    actions={
      <>
        <button type="button" onClick={onRetry} className={buttonClass.secondary}>
          Try again
        </button>
        <button type="button" onClick={onRemove} className={buttonClass.primary}>
          Remove from the board
        </button>
      </>
    }
  />
)

const NoMatches = ({ query, onClear }: { query: string; onClear: () => void }) => (
  <div className="grid flex-1 place-items-center px-6 pb-16">
    <div className="max-w-sm text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
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

export const BoardPage = ({ org }: { org: string }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const viewer = useViewer()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const selected = (params.get("repos") ?? "").split(",").filter((name) => name !== "")
  const filters = readFilters(params)
  // The search box updates at once; the board catches up without blocking the next keystroke.
  const searchText = useDeferredValue(filters.text)
  const boardFilters = { ...filters, text: searchText }
  const selectedRef = params.get(CARD_PARAM)
  const [dragging, setDragging] = useState(false)
  const [dismissedFailures, setDismissedFailures] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => readCollapsed(org))
  const [composing, setComposing] = useState<string | null>(null)
  const [composerRepo, setComposerRepo] = useState(() => storage.read(composerRepoKey(org)))
  const searchInput = useRef<HTMLInputElement>(null)

  const repos = useQuery({ queryKey: ["org-repos", org], queryFn: () => fetchOrgRepos(org) })
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })

  const selection = selected.join(",")
  const hasSelection = selection !== ""
  // The remembered selection fills an empty address once per organization; after that an empty
  // selection is the user's choice.
  // Without a remembered selection, an organization with few enough active repositories shows
  // all of them, so a first visit lands on a board instead of a chooser.
  const restoredFor = useRef<string | null>(null)
  useEffect(() => {
    if (hasSelection) {
      restoredFor.current = org
      return
    }
    if (restoredFor.current === org) return
    const remembered = storage.read(reposKey(org))
    const active = (repos.data ?? []).filter((repo) => !repo.archived).map((repo) => repo.name)
    const fallback = active.length > 0 && active.length <= MAX_BOARD_REPOS ? active.join(",") : null
    if (remembered === null && repos.data === undefined) return
    restoredFor.current = org
    const choice = remembered ?? fallback
    if (choice) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set("repos", choice)
          return next
        },
        { replace: true },
      )
    }
  }, [org, hasSelection, setParams, repos.data])

  const boardKey = ["board", org, selection] as const
  const writeKey = ["board-write", org, selection] as const
  // A refetch that lands during a drag or before a write is stored would undo it on screen.
  const moving = useIsMutating({ mutationKey: writeKey }) > 0
  const settled = !dragging && !moving
  const board = useQuery({
    queryKey: boardKey,
    queryFn: () => fetchBoard(org, selected),
    enabled: hasSelection,
    refetchInterval: settled ? REFRESH_MS : false,
    refetchOnWindowFocus: settled,
  })

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

  // The last write to finish reads the board again; an earlier one would read it while a later
  // write is still on its way and show that card back in its old place for a moment.
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

  const refetchAfterWrites = () =>
    queryClient.isMutating({ mutationKey: writeKey }) > 1
      ? undefined
      : queryClient.invalidateQueries({ queryKey: boardKey })

  /** Stops board reads in flight, whose answers predate a write and would undo it on screen. */
  const holdReads = () => queryClient.cancelQueries({ queryKey: boardKey }, { revert: false })

  const move = useMutation({
    mutationKey: [...writeKey, "move"],
    mutationFn: ({
      request,
    }: {
      request: MoveCardRequest
      cardMove: CardMove
      previous: Board
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
        })
        return
      }
      if (request.fromColumn === request.toColumn) return
      toast({
        tone: "success",
        title: `Moved ${card.repo}#${card.number} to ${columnTitle(request.toColumn)}`,
        detail: card.title,
        ...(undo === null ? {} : { action: { label: "Undo", run: () => startMove(undo, null) } }),
      })
    },
    onError: (error, { previous, request, cardMove, undo }) => {
      // A partly applied move changed Forgejo, so the refetch below shows the truth; restoring
      // the board from before the move would show a state that no longer exists.
      if (error instanceof RequestFailed && error.code === "move_partly_applied") {
        toast({
          tone: "error",
          title: "The move was only partly applied",
          detail: `${error.message}. The board shows the issue as it is now.`,
        })
        return
      }
      queryClient.setQueryData(boardKey, previous)
      if (error instanceof RequestFailed && error.code === "board_changed") {
        toast({
          tone: "warning",
          title: "Someone changed the board meanwhile",
          detail: "The card did not move. The board has been reloaded; try again.",
        })
        return
      }
      toast({
        tone: "error",
        title: `Couldn't move ${request.repo}#${request.number}`,
        detail: error.message,
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
      previous: current,
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
        title: `Created ${card.repo}#${card.number}`,
        detail: orderSaved
          ? card.title
          : "Its place at the top of the column was not saved, so it may show lower down.",
        action: { label: "Open", run: () => latestActions.current?.open(card) },
      })
    },
    onError: (error) =>
      toast({ tone: "error", title: "The issue was not created", detail: error.message }),
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
        ...(undo === undefined
          ? {}
          : { action: { label: "Undo", run: () => update.mutate({ ...undo, issue }) } }),
      })
    },
    onError: (error, variables) =>
      toast({
        tone: "error",
        title: `Couldn't change ${variables.issue}`,
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

  const chooseRepos = (repoNames: ReadonlyArray<string>) => {
    // An empty choice is remembered too, so the next visit does not pick repositories again.
    if (repoNames.length === 0) storage.write(reposKey(org), "")
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (repoNames.length === 0) next.delete("repos")
        else next.set("repos", repoNames.join(","))
        return next
      },
      { replace: true },
    )
  }

  const toggleCollapsed = (column: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      storage.write(collapsedKey(org), JSON.stringify([...next]))
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
  const data = board.data
  const archived = new Set(
    (repos.data ?? []).filter((repo) => repo.archived).map((repo) => repo.name),
  )
  const failed = new Set((data?.failedRepos ?? []).map((failure) => failure.repo))
  const creatableRepos = (data?.repos ?? []).filter(
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
  // only if the board's address is unchanged since; otherwise it would undo a new filter.
  const pushedFrom = useRef<string | null>(null)
  const boardAddress = () => {
    const next = new URLSearchParams(window.location.search)
    next.delete(CARD_PARAM)
    return next.toString()
  }
  const openPanel = (card: BoardCard) => {
    if (selectedRef === null) pushedFrom.current = boardAddress()
    setCardParam(cardRef(card), selectedRef !== null)
  }
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

  // The repositories are remembered, and Board in the header returns here, only once they all
  // loaded, so a mistyped repository is not brought back on the next visit.
  useEffect(() => {
    if (data !== undefined && data.failedRepos.length === 0 && data.repos.length > 0) {
      storage.write(reposKey(data.org), data.repos.join(","))
      storage.write(
        LAST_BOARD_KEY,
        `/board/${encodeURIComponent(data.org)}?repos=${data.repos.join(",")}`,
      )
    }
  }, [data])

  // A card in the address that the board does not have, such as a closed issue's old link.
  useEffect(() => {
    if (selectedRef === null || data === undefined || selectedCard !== undefined) return
    // A repository that failed to load this time keeps its card open until it loads again.
    const repo = selectedRef.split("#")[0]?.toLowerCase()
    if (data.failedRepos.some((failure) => failure.repo.toLowerCase() === repo)) return
    toast({
      tone: "warning",
      title: `${selectedRef} is not on this board`,
      detail: "It may be closed, in another repository, or moved elsewhere.",
    })
    setCardParam(null, true)
  })

  const openComposer = (column: string) => {
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

  // Single-key shortcuts; see ShortcutsDialog for the list.
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {})
  shortcuts.current = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
    if (isTypingTarget(event.target) || shortcutsOpen || dragging) return
    if (document.querySelector("dialog[open]") !== null) return
    const key = event.key
    if (key === "?") setShortcutsOpen(true)
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
  // A card's link keeps the board's repositories and filters, but not the search text, so typing
  // does not re-render every card.
  const hrefBase = (() => {
    const next = new URLSearchParams(params)
    next.delete(CARD_PARAM)
    next.delete(FILTER_PARAMS.text)
    return next.toString()
  })()

  const orgMissing = repos.error instanceof RequestFailed && repos.error.status === 404
  const allFailed =
    data !== undefined &&
    data.failedRepos.length > 0 &&
    data.failedRepos.length === data.repos.length
  const orgTitle =
    orgs.data?.find((candidate) => candidate.name.toLowerCase() === org.toLowerCase())?.fullName ||
    org
  const removeFailed = () => {
    const failed = new Set(failures.map((failure) => failure.repo.toLowerCase()))
    chooseRepos(selected.filter((repo) => !failed.has(repo.toLowerCase())))
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
  const onlyDefaultColumns = data?.columns.every((column) => column._tag !== "Status")
  const composerTarget =
    composerRepo !== null && creatableRepos.includes(composerRepo)
      ? composerRepo
      : creatableRepos[0]

  return (
    <RepoPaletteProvider repos={data?.repos ?? selected}>
      <main className="flex h-[calc(100dvh-3.5rem-1px)] min-h-0 flex-col">
        <h1 className="sr-only">Board for {orgTitle}</h1>
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <OrgSwitcher org={org} />
            {!orgMissing && (
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
                /
              </span>
            )}
            {repos.data !== undefined && (
              <RepoPicker
                repos={repos.data}
                selected={selected}
                onChange={chooseRepos}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!online ? (
              <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
                Offline
              </span>
            ) : (
              data !== undefined && (
                <span
                  className="mr-1 hidden text-xs text-zinc-500 lg:inline dark:text-zinc-400"
                  title={new Date(board.dataUpdatedAt).toLocaleString()}
                >
                  {board.isFetching
                    ? "Refreshing…"
                    : `Updated ${relativeTime(new Date(board.dataUpdatedAt).toISOString(), now)}`}
                </span>
              )
            )}
            {hasSelection && (
              <button
                type="button"
                onClick={() => void board.refetch()}
                disabled={board.isFetching}
                aria-label="Refresh the board"
                title="Refresh (R)"
                className={`${buttonClass.icon} max-sm:hidden`}
              >
                <RefreshIcon className={`size-4 ${board.isFetching ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
              className={`${buttonClass.icon} max-sm:hidden`}
            >
              <KeyboardIcon />
            </button>
            {canCreate && firstCreatable !== undefined && (
              <button
                type="button"
                onClick={() => openComposer(firstCreatable.key)}
                className={`${buttonClass.primary} ml-1`}
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

        {data !== undefined && !allFailed && (
          <BoardFiltersBar
            cards={data.cards}
            filters={filters}
            setParams={setParams}
            searchInput={searchInput}
            shown={shownCount}
            total={data.cards.length}
          />
        )}

        {repos.isError && !orgMissing && (
          <Notice tone="error">
            Could not load the repositories of {org}: {repos.error.message}
          </Notice>
        )}
        {failures.length > 0 &&
          failures.length < (data?.repos.length ?? 0) &&
          dismissedFailures !== failureId && (
            <Notice tone="warning" onDismiss={() => setDismissedFailures(failureId)}>
              Some repositories did not load:{" "}
              {failures.map((failure) => `${failure.repo} (${failure.message})`).join(", ")}.{" "}
              <button type="button" onClick={removeFailed} className="font-medium underline">
                Remove {failures.length === 1 ? "it" : "them"} from the board
              </button>
            </Notice>
          )}
        {data !== undefined && !data.viewerCanArrange && (
          <Notice tone="info">
            You can view this board. Only members of {data.org} can move cards and add issues.
          </Notice>
        )}
        {onlyDefaultColumns && (
          <Notice tone="info">
            <span className="flex items-center gap-1.5">
              <ColumnsIcon className="size-4 text-zinc-400" />
              Add exclusive labels such as{" "}
              <code className="font-mono text-xs">Status/In Progress</code> to {org} in Forgejo to
              get more columns between Todo and Done.
            </span>
          </Notice>
        )}

        {orgMissing ? (
          <OrgNotFound org={org} />
        ) : !hasSelection ? (
          repos.isPending ? (
            <div className="min-h-0 flex-1">
              <BoardSkeleton />
            </div>
          ) : repos.isError ? null : (
            <EmptyBoard onChoose={() => setPickerOpen(true)} />
          )
        ) : data === undefined ? (
          board.isError ? (
            <Problem
              title="The board did not load"
              detail={board.error.message}
              actions={
                <button
                  type="button"
                  onClick={() => void board.refetch()}
                  className={buttonClass.primary}
                >
                  Try again
                </button>
              }
            />
          ) : (
            <div className="min-h-0 flex-1">
              <BoardSkeleton />
            </div>
          )
        ) : allFailed ? (
          <ReposFailed
            failures={data.failedRepos}
            onRemove={removeFailed}
            onRetry={() => void board.refetch()}
          />
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
                    columnTitle={columnTitle(composing)}
                    repos={creatableRepos}
                    repo={composerTarget}
                    onRepoChange={(repo) => {
                      setComposerRepo(repo)
                      storage.write(composerRepoKey(org), repo)
                    }}
                    onClose={() => {
                      const column = composing
                      setComposing(null)
                      // Focus goes back to the column's + button, where the composer was opened.
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLElement>(
                            `button[aria-label="New issue in ${CSS.escape(columnTitle(column))}"]`,
                          )
                          ?.focus(),
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
            position={{ index: selectedIndex, count: selectedColumn.length }}
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
        <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </main>
    </RepoPaletteProvider>
  )
}
