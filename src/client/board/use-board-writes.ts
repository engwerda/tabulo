import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Board, UpdateBoardRequest } from "../../shared/api.ts"
import { createBoard, deleteBoard, updateBoard } from "../api.ts"
import { forgetBoard } from "../scope/remembered.ts"
import { applySavedBoard } from "./board-settings.ts"
import { boardQueryKey, boardsQueryKey } from "./board-view.ts"

/** A board update, and the column order the user arranged, which the board shows at once. */
export type BoardUpdate = {
  readonly request: UpdateBoardRequest
  readonly order?: ReadonlyArray<string> | undefined
}

/** The board writes of an organization, each with what it changes in the loaded boards. */
export const useBoardWrites = (org: string) => {
  const queryClient = useQueryClient()
  const refreshList = () => void queryClient.invalidateQueries({ queryKey: boardsQueryKey(org) })
  const create = useMutation({ mutationFn: createBoard, onSuccess: refreshList })
  const update = useMutation({
    mutationFn: ({ request }: BoardUpdate) => updateBoard(request),
    onSuccess: (saved, { request, order }) => {
      const key = boardQueryKey(org, request.board)
      queryClient.setQueryData<Board>(key, (current) =>
        current === undefined ? current : applySavedBoard(current, saved, order),
      )
      void queryClient.invalidateQueries({ queryKey: key })
      refreshList()
    },
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
