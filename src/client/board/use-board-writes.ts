import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Board, UpdateBoardRequest } from "../../shared/api.ts"
import { createBoard, deleteBoard, updateBoard } from "../api.ts"
import { forgetBoard } from "../scope/remembered.ts"
import { applySavedBoard } from "./board-settings.ts"
import { boardListQueryKey, boardQueryKey, boardWriteKey } from "./board-view.ts"

export type BoardUpdate = {
  readonly request: UpdateBoardRequest
  readonly order?: ReadonlyArray<string> | undefined
}

export const useBoardWrites = (org: string) => {
  const queryClient = useQueryClient()
  const refreshList = () => void queryClient.invalidateQueries({ queryKey: boardListQueryKey(org) })
  const create = useMutation({ mutationFn: createBoard, onSuccess: refreshList })
  const update = useMutation({
    mutationKey: [...boardWriteKey(org), "settings"],
    mutationFn: ({ request }: BoardUpdate) => updateBoard(request),
    onSuccess: (saved, { request, order }) => {
      queryClient.setQueryData<Board>(boardQueryKey(org, request.board), (current) =>
        current === undefined ? current : applySavedBoard(current, saved, order),
      )
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
