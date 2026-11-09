import type { QueryClient } from "@tanstack/react-query"
import { boardWriteKey, everyBoardQueryKey } from "./board-view.ts"

const [BOARD_WRITE] = boardWriteKey("")

/** Whether a board write of the organization is pending, so a read now could undo it on screen. */
export const writingBoards = (queryClient: QueryClient, org: string) =>
  queryClient.isMutating({ mutationKey: boardWriteKey(org) }) > 0

/**
 * Makes every mutation keyed under `boardWriteKey(org)` a board write. When one starts, it stops
 * the organization's board reads in flight, whose answers predate it. When the organization's
 * last pending write ends, the boards are read again, once, however many writes ended with it.
 */
export const syncBoardsWithWrites = (queryClient: QueryClient) =>
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "updated") return
    const [scope, org] = event.mutation.options.mutationKey ?? []
    if (scope !== BOARD_WRITE || typeof org !== "string") return
    const boards = { queryKey: everyBoardQueryKey(org) }
    if (event.action.type === "pending") {
      void queryClient.cancelQueries(boards)
    } else if (
      (event.action.type === "success" || event.action.type === "error") &&
      !writingBoards(queryClient, org)
    ) {
      void queryClient.invalidateQueries(boards)
    }
  })
