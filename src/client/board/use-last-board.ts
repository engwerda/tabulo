import { useQuery } from "@tanstack/react-query"
import { fetchBoard } from "../api.ts"
import type { LinkedBoard } from "../epics/epics-view.ts"
import { rememberedBoard } from "../scope/remembered.ts"
import { boardQueryKey } from "./board-view.ts"

/**
 * The organization's last board as this tab loaded it, or undefined. Links read only the cache:
 * fetching the board to learn its repositories would load every card.
 */
export const useLastBoard = (org: string): LinkedBoard | undefined => {
  const id = rememberedBoard(org)
  return useQuery({
    queryKey: boardQueryKey(org, id),
    queryFn: () => fetchBoard(org, id),
    enabled: false,
    select: (data) => data.board,
  }).data
}
