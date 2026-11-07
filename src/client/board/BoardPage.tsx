import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useState } from "react"
import { Link, useSearchParams } from "wouter"
import type { Board, MoveCardRequest } from "../../shared/api.ts"
import { fetchBoard, fetchOrgRepos, moveCard } from "../api.ts"
import { BoardColumns } from "./BoardColumns.tsx"
import { BoardFiltersBar } from "./BoardFiltersBar.tsx"
import {
  applyMove,
  type CardMove,
  isFiltered,
  matchesFilters,
  orderAfterMove,
  readFilters,
} from "./board-view.ts"
import { RepoPicker } from "./RepoPicker.tsx"

const REFRESH_MS = 60_000

const rememberedReposKey = (org: string) => `tabulo.board.repos.${org.toLowerCase()}`

// Remembering the selection is a convenience: storage can be missing or refuse writes.
const readRememberedRepos = (org: string) => {
  try {
    return window.localStorage.getItem(rememberedReposKey(org))
  } catch {
    return null
  }
}

const rememberRepos = (org: string, repos: string) => {
  try {
    window.localStorage.setItem(rememberedReposKey(org), repos)
  } catch {}
}

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
  const selected = (params.get("repos") ?? "").split(",").filter((name) => name !== "")
  const filters = readFilters(params)
  const [dragging, setDragging] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [dismissedFailures, setDismissedFailures] = useState<string | null>(null)

  const repos = useQuery({ queryKey: ["org-repos", org], queryFn: () => fetchOrgRepos(org) })

  const selection = selected.join(",")
  const hasSelection = selection !== ""
  useEffect(() => {
    if (hasSelection) {
      rememberRepos(org, selection)
      return
    }
    const remembered = readRememberedRepos(org)
    if (remembered) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set("repos", remembered)
          return next
        },
        { replace: true },
      )
    }
  }, [org, selection, hasSelection, setParams])

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
    onMutate: async ({ move, request: { orderedKeys } }) => {
      setMoveError(null)
      await queryClient.cancelQueries({ queryKey: boardKey })
      const previous = queryClient.getQueryData<Board>(boardKey)
      if (previous !== undefined) {
        queryClient.setQueryData<Board>(
          boardKey,
          applyMove(previous, move, orderedKeys, new Date().toISOString()),
        )
      }
      return { previous }
    },
    onError: (error, _, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(boardKey, context.previous)
      setMoveError(`The card was not moved: ${error.message}`)
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
        toColumn: cardMove.toColumn,
        orderedKeys: orderAfterMove(board.data, cardMove),
      },
    })
  }

  const chooseRepos = (repoNames: ReadonlyArray<string>) => {
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

  const failures = board.data?.failedRepos ?? []
  const failureId = failures.map((failure) => `${failure.repo}:${failure.message}`).join("|")
  const filtered = isFiltered(filters)

  return (
    <main className="py-4">
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 sm:px-6">
        <h1 className="text-lg font-semibold">
          <span className="sr-only">Board for </span>
          {org}
        </h1>
        <Link
          href="/board"
          className="text-sm text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          Change organization
        </Link>
        {repos.data !== undefined && (
          <RepoPicker
            repos={repos.data}
            selected={selected}
            onChange={chooseRepos}
            defaultOpen={!hasSelection}
          />
        )}
        {board.data !== undefined && (
          <BoardFiltersBar cards={board.data.cards} filters={filters} setParams={setParams} />
        )}
        <p className="sr-only" aria-live="polite">
          {board.isFetching ? "Refreshing board" : ""}
        </p>
      </div>

      {repos.isError && (
        <Banner tone="error">
          Could not load the repositories of {org}: {repos.error.message}
        </Banner>
      )}
      {moveError !== null && (
        <Banner tone="error" onDismiss={() => setMoveError(null)}>
          {moveError}
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
          Choose the repositories whose issues the board shows.
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
              Filters hide some cards. A moved card keeps its place among the hidden ones.
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
