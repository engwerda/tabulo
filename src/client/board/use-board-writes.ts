import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Board, UpdateBoardRequest } from "../../shared/api.ts"
import { createBoard, deleteBoard, updateBoard } from "../api.ts"
import { forgetBoard } from "../scope/remembered.ts"
import { applySavedBoard } from "./board-settings.ts"
import { boardQueryKey, boardsQueryKey, boardWriteKey, orgBoardsKey } from "./board-view.ts"

/** A board update, and the column order the user arranged, which the board shows at once. */
export type BoardUpdate = {
  readonly request: UpdateBoardRequest
  readonly order?: ReadonlyArray<string> | undefined
}

/**
 * Keeps the reads of an organization's boards from undoing its board writes on screen. A write
 * stops the reads in flight as it starts, whose answers predate it, and the last write to finish
 * reads the boards again: an earlier one would read them while a later write is still on its way
 * and show its card back in its old place for a moment.
 */
export const useBoardReads = (org: string) => {
  const queryClient = useQueryClient()
  return {
    holdReads: () => queryClient.cancelQueries({ queryKey: orgBoardsKey(org) }, { revert: false }),
    refetchAfterWrites: () => {
      if (queryClient.isMutating({ mutationKey: boardWriteKey(org) }) > 1) return
      // Not returned: React Query would keep the write pending, and a moved card "Saving", until
      // the reads finished.
      void queryClient.invalidateQueries({ queryKey: orgBoardsKey(org) })
    },
  }
}

/** The board writes of an organization, each with what it changes in the loaded boards. */
export const useBoardWrites = (org: string) => {
  const queryClient = useQueryClient()
  const { holdReads, refetchAfterWrites } = useBoardReads(org)
  const refreshList = () => void queryClient.invalidateQueries({ queryKey: boardsQueryKey(org) })
  const create = useMutation({ mutationFn: createBoard, onSuccess: refreshList })
  const update = useMutation({
    mutationKey: [...boardWriteKey(org), "settings"],
    mutationFn: ({ request }: BoardUpdate) => updateBoard(request),
    onMutate: holdReads,
    onSuccess: (saved, { request, order }) => {
      queryClient.setQueryData<Board>(boardQueryKey(org, request.board), (current) =>
        current === undefined ? current : applySavedBoard(current, saved, order),
      )
      refreshList()
    },
    onSettled: refetchAfterWrites,
  })
  const remove = useMutation({
    mutationFn: deleteBoard,
    onSuccess: (_, { board }) => {
      forgetBoard(org, board)
      refreshList()
    },
  })
  return { create, update, remove }
}
