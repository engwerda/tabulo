import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { useSearchParams } from "wouter"
import type { Board, MoveCardRequest } from "../../shared/api.ts"
import { fetchBoard, moveCard, RequestFailed } from "../api.ts"
import { ScopeBar } from "../scope/ScopeBar.tsx"
import { useRepoSelection } from "../scope/use-repo-selection.ts"
import { BoardColumns } from "./BoardColumns.tsx"
import { BoardFiltersBar } from "./BoardFiltersBar.tsx"
import {
  applyMove,
  type CardMove,
  isFiltered,
  matchesFilters,
  readFilters,
  replaceCard,
} from "./board-view.ts"

const REFRESH_MS = 60_000

const Banner = ({
  tone,
  children,
  onDismiss,
}: {
  tone: "error" | "warning"
  children: ReactNode
  onDismiss?: () => void
}) => (
  <div
    role={tone === "error" ? "alert" : "status"}
    className={`mx-4 mb-3 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm sm:mx-6 ${
      tone === "error"
        ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    }`}
  >
    <div>{children}</div>
    {onDismiss !== undefined && (
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md px-2 py-0.5 font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:hover:bg-white/10"
      >
        Dismiss
      </button>
    )}
  </div>
)

export const BoardPage = ({ org }: { org: string }) => {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const repoSelection = useRepoSelection(org)
  const { selected, selection } = repoSelection
  const filters = readFilters(params)
  const [dragging, setDragging] = useState(false)
  const [moveNotice, setMoveNotice] = useState<{
    tone: "error" | "warning"
    text: string
  } | null>(null)
  const [dismissedFailures, setDismissedFailures] = useState<string | null>(null)

  const hasSelection = selection !== ""

  const boardKey = ["board", org, selection] as const
  const moveKey = ["move", ...boardKey] as const
  // A refetch that lands during a drag or before a move is stored would undo it on screen.
  const moving = useIsMutating({ mutationKey: moveKey }) > 0
  const settled = !dragging && !moving
  const board = useQuery({
    queryKey: boardKey,
    queryFn: () => fetchBoard(org, selected),
    enabled: hasSelection,
    refetchInterval: settled ? REFRESH_MS : false,
    refetchOnWindowFocus: settled,
  })

  const move = useMutation({
    mutationKey: moveKey,
    mutationFn: ({ request }: { move: CardMove; request: MoveCardRequest }) => moveCard(request),
    onMutate: async ({ move }) => {
      setMoveNotice(null)
      await queryClient.cancelQueries({ queryKey: boardKey })
      const previous = queryClient.getQueryData<Board>(boardKey)
      if (previous !== undefined) {
        queryClient.setQueryData<Board>(
          boardKey,
          applyMove(previous, move, new Date().toISOString()),
        )
      }
      return { previous }
    },
    onSuccess: ({ card, orderSaved }) => {
      queryClient.setQueryData<Board>(boardKey, (current) =>
        current === undefined ? current : replaceCard(current, card.key, () => card),
      )
      if (!orderSaved) {
        setMoveNotice({
          tone: "warning",
          text: "The card moved in Forgejo, but Tabulo could not save its place in the column. Others may see it elsewhere in the column.",
        })
      }
    },
    onError: (error, _, context) => {
      // A partly applied move changed Forgejo, so the refetch below shows the truth; restoring
      // the board from before the move would show a state that no longer exists.
      if (error instanceof RequestFailed && error.code === "move_partly_applied") {
        setMoveNotice({
          tone: "error",
          text: `${error.message}. The board shows the issue as it is now.`,
        })
        return
      }
      if (context?.previous !== undefined) queryClient.setQueryData(boardKey, context.previous)
      if (error instanceof RequestFailed && error.code === "board_changed") {
        setMoveNotice({
          tone: "warning",
          text: "Someone changed the board while you were moving the card, so it did not move. The board has been reloaded; try again.",
        })
        return
      }
      setMoveNotice({ tone: "error", text: `The card was not moved: ${error.message}` })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: boardKey }),
  })

  const startMove = (cardMove: CardMove) => {
    const card = board.data?.cards.find((candidate) => candidate.key === cardMove.key)
    if (board.data === undefined || card === undefined) return
    move.mutate({
      move: cardMove,
      request: {
        org: board.data.org,
        repo: card.repo,
        number: card.number,
        fromColumn: card.column,
        toColumn: cardMove.toColumn,
        afterKey: cardMove.afterKey,
        beforeKey: cardMove.beforeKey,
      },
    })
  }

  const failures = board.data?.failedRepos ?? []
  const failureId = failures.map((failure) => `${failure.repo}:${failure.message}`).join("|")
  const filtered = isFiltered(filters)

  return (
    <main className="py-4">
      <ScopeBar org={org} view="board" repoSelection={repoSelection}>
        {board.data !== undefined && (
          <BoardFiltersBar cards={board.data.cards} filters={filters} setParams={setParams} />
        )}
        <p className="sr-only" aria-live="polite">
          {board.isFetching ? "Refreshing board" : ""}
        </p>
      </ScopeBar>

      {moveNotice !== null && (
        <Banner tone={moveNotice.tone} onDismiss={() => setMoveNotice(null)}>
          {moveNotice.text}
        </Banner>
      )}
      {failures.length > 0 && dismissedFailures !== failureId && (
        <Banner tone="warning" onDismiss={() => setDismissedFailures(failureId)}>
          Some repositories could not be loaded:{" "}
          {failures.map((failure) => `${failure.repo} (${failure.message})`).join(", ")}.
        </Banner>
      )}

      {!hasSelection ? (
        <p className="px-4 text-sm text-zinc-600 sm:px-6 dark:text-zinc-400">
          Choose the repositories whose issues the board shows with the Repositories button above.
        </p>
      ) : board.data === undefined ? (
        board.isError ? (
          <Banner tone="error">
            Could not load the board: {board.error.message}{" "}
            <button
              type="button"
              onClick={() => void board.refetch()}
              className="font-medium underline"
            >
              Retry
            </button>
          </Banner>
        ) : (
          <p className="px-4 text-sm text-zinc-500 sm:px-6">Loading the board…</p>
        )
      ) : (
        <>
          {!board.data.viewerCanArrange && (
            <p className="px-4 pb-2 text-xs text-zinc-500 sm:px-6 dark:text-zinc-400">
              You can view this board. Only members of {board.data.org} can move and reorder its
              cards.
            </p>
          )}
          {filtered && (
            <p className="px-4 pb-2 text-xs text-zinc-500 sm:px-6 dark:text-zinc-400">
              Filters hide some cards. A moved card lands directly below the card shown above it.
            </p>
          )}
          <BoardColumns
            board={board.data}
            visible={(card) => matchesFilters(card, filters)}
            onMove={startMove}
            onDragChange={(isDragging) => {
              setDragging(isDragging)
              if (isDragging) void queryClient.cancelQueries({ queryKey: boardKey })
            }}
          />
        </>
      )}
    </main>
  )
}
