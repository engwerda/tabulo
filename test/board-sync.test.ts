import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { syncBoardsWithWrites } from "../src/client/board/board-sync.ts"
import { boardQueryKey, boardWriteKey } from "../src/client/board/board-view.ts"

const deferred = <A>() => {
  let resolve: (value: A) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<A>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

type Answer = { readonly read: number }

/** A board on screen whose reads answer from `answers`, or at once when it has none queued. */
const boardOnScreen = async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  })
  syncBoardsWithWrites(queryClient)
  const answers: Array<Promise<Answer>> = []
  let reads = 0
  const board = new QueryObserver(queryClient, {
    queryKey: boardQueryKey("Acme", "default"),
    queryFn: () => {
      reads += 1
      return answers.shift() ?? Promise.resolve({ read: reads })
    },
  })
  board.subscribe(() => {})
  await vi.waitFor(() => expect(board.getCurrentResult().isSuccess).toBe(true))
  const write = (name: string, answer: Promise<unknown>, org = "acme") =>
    new MutationObserver(queryClient, {
      mutationKey: [...boardWriteKey(org), name],
      mutationFn: () => answer,
    })
      .mutate()
      .catch(() => {})
  const settledReads = async () => {
    await vi.waitFor(() => expect(board.getCurrentResult().fetchStatus).toBe("idle"))
    await new Promise((resolve) => setTimeout(resolve, 0))
    return reads
  }
  return { queryClient, board, answers, write, settledReads }
}

describe("board writes", () => {
  it("read the boards again once when writes of the organization settle together", async () => {
    const { write, settledReads } = await boardOnScreen()
    const answer = deferred<void>()

    const writes = Promise.all([write("move", answer.promise), write("settings", answer.promise)])
    answer.resolve()
    await writes

    expect(await settledReads()).toBe(2)
  })

  it("read the boards again only after the organization's last pending write", async () => {
    const { write, settledReads } = await boardOnScreen()
    const move = deferred<void>()
    const settings = deferred<void>()
    const other = deferred<void>()
    void write("other", other.promise, "globex")

    const moved = write("move", move.promise)
    const saved = write("settings", settings.promise)
    move.resolve()
    await moved
    const whileSaving = await settledReads()
    settings.reject(new Error("refused"))
    await saved

    expect(whileSaving).toBe(1)
    expect(await settledReads()).toBe(2)
  })

  it("stop a board read in flight without an error and keep data written meanwhile", async () => {
    const { queryClient, board, answers, write } = await boardOnScreen()
    const stale = deferred<Answer>()
    answers.push(stale.promise)

    void board.refetch()
    queryClient.setQueryData(boardQueryKey("acme", "default"), { read: 99 })
    void write("move", new Promise(() => {}))
    stale.resolve({ read: 2 })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(board.getCurrentResult()).toMatchObject({
      status: "success",
      fetchStatus: "idle",
      error: null,
      data: { read: 99 },
    })
  })
})
