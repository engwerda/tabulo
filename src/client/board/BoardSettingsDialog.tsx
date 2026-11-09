import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { useLocation } from "wouter"
import { type Board, DEFAULT_BOARD_ID, MAX_BOARD_NAME, MAX_REPOS } from "../../shared/api.ts"
import { fetchBoard, fetchOrgRepos, RequestFailed } from "../api.ts"
import { RepoChecklist } from "../scope/RepoPicker.tsx"
import { forgetBoard } from "../scope/remembered.ts"
import { boardHref } from "../scope/views.ts"
import { ErrorNotice, sentence } from "../ui/ErrorNotice.tsx"
import { LockIcon, XIcon } from "../ui/icons.tsx"
import { buttonClass, inputClass } from "../ui/primitives.tsx"
import { useToast } from "../ui/toast.tsx"
import { focusNextBoardSwitcher } from "./BoardSwitcher.tsx"
import {
  type BoardDraft,
  columnRows,
  type DraftField,
  describeFields,
  draftOf,
  draftProblem,
  isDirty,
  moveColumn,
  NEW_BOARD_DRAFT,
  rebaseDraft,
  type SettingsBase,
  setColumnHidden,
  toCreateRequest,
  toUpdateRequest,
} from "./board-settings.ts"
import { boardQueryKey, boardsQueryKey } from "./board-view.ts"
import { ColumnSettings } from "./ColumnSettings.tsx"
import { useBoardWrites } from "./use-board-writes.ts"

export type SettingsMode =
  | { readonly _tag: "Create" }
  | {
      readonly _tag: "Edit"
      /** The board as it was on screen when the dialog opened. */
      readonly board: Board
      /** The section to start at, as an empty board asks for its repositories. */
      readonly focus?: "repos" | "columns"
    }

const isCode = (error: unknown, code: string) =>
  error instanceof RequestFailed && error.code === code

const sectionTitle = "text-sm font-medium text-zinc-900 dark:text-zinc-50"
const dangerButton =
  "inline-flex h-8 pointer-coarse:h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-3 text-sm font-medium text-white shadow-sm shadow-red-600/20 transition hover:bg-red-500 active:bg-red-700 aria-disabled:opacity-60 dark:bg-red-500 dark:hover:bg-red-400"
const quietDangerButton =
  "inline-flex h-8 pointer-coarse:h-11 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
const sectionHint = "mt-0.5 text-xs text-zinc-500 dark:text-zinc-400"

/**
 * A board's settings, or a new board's, with one Save: the update replaces every field under one
 * version, so the form saves them together. When someone else saved first, the dialog keeps the
 * user's changes on top of theirs and says what they changed.
 */
export const BoardSettingsDialog = ({
  org,
  mode,
  onClose,
}: {
  readonly org: string
  readonly mode: SettingsMode
  readonly onClose: () => void
}) => {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const reposSection = useRef<HTMLElement>(null)
  const repoSearch = useRef<HTMLInputElement>(null)
  const firstColumnBox = useRef<HTMLInputElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  // A drag that Escape cancels must not close the dialog too.
  const dragging = useRef(false)
  const [announcer, setAnnouncer] = useState<HTMLDialogElement | null>(null)
  const startAt = useRef(mode._tag === "Edit" ? mode.focus : undefined)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [, navigate] = useLocation()
  const writes = useBoardWrites(org)
  const orgRepos = useQuery({ queryKey: ["org-repos", org], queryFn: () => fetchOrgRepos(org) })

  const [base, setBase] = useState<SettingsBase | null>(mode._tag === "Edit" ? mode.board : null)
  const [draft, setDraft] = useState<BoardDraft>(() =>
    base === null ? NEW_BOARD_DRAFT : draftOf(base),
  )
  /** What someone else changed when their save beat the user's save or delete. */
  const [clash, setClash] = useState<{
    readonly theirChanges: ReadonlyArray<DraftField>
    readonly during: "save" | "delete"
  } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [problemShown, setProblemShown] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // The confirmation takes focus on its safe choice, and gives it back when it goes away.
  const confirmShown = useRef(false)
  useEffect(() => {
    if (confirmingDelete) keepButton.current?.focus()
    else if (confirmShown.current) deleteButton.current?.focus()
    confirmShown.current = confirmingDelete
  }, [confirmingDelete])

  const unreadable = base?.board.unreadableRepos ?? 0
  const kept = draft.dropUnreadable ? 0 : unreadable
  const problem = draftProblem(draft, unreadable)
  // A write in flight keeps the dialog open: its answer opens the new board, leaves a deleted one,
  // or shows why it was refused.
  const busy = writes.create.isPending
    ? "Wait until the board is created"
    : writes.update.isPending
      ? "Wait until the board is saved"
      : writes.remove.isPending
        ? "Wait until the board is deleted"
        : null
  const pending = busy !== null
  const dirty =
    base === null ? draft.name.trim() !== "" || draft.repos.length > 0 : isDirty(base, draft)

  useLayoutEffect(() => {
    const element = dialog.current
    if (element === null || element.open) return
    element.showModal()
    setAnnouncer(element)
    if (startAt.current === "repos") {
      ;(repoSearch.current ?? reposSection.current)?.focus()
    } else if (startAt.current === "columns") {
      firstColumnBox.current?.focus()
    } else {
      nameInput.current?.focus()
    }
  }, [])

  const close = () => dialog.current?.close()
  const dismiss = () => {
    if (!pending) close()
  }
  // A write's answer comes from its `mutateAsync` promise, which settles after the dialog is gone
  // too, where callbacks given to `mutate` would not run. Back or Forward can take the dialog away
  // while a write is in flight; its answer then shows as a toast and opens no board.
  const isOpen = () => dialog.current?.open === true

  /** Why a write failed: in the dialog, or in a toast once the dialog is gone. */
  const fail = (title: string, message: string) => {
    if (isOpen()) setFailure(sentence(message))
    else toast({ tone: "error", title, detail: sentence(message) })
  }

  /** Closes the dialog for another board, whose switcher then takes focus. */
  const openBoard = (board: string, replace: boolean) => {
    if (!isOpen()) return
    focusNextBoardSwitcher()
    close()
    navigate(boardHref(org, board), { replace })
  }

  const boardGone = (current: SettingsBase) => {
    forgetBoard(org, current.board.id)
    void queryClient.invalidateQueries({ queryKey: boardsQueryKey(org) })
    toast({
      tone: "warning",
      title: `${current.board.name} was deleted`,
      detail: "Someone deleted it while you edited it, so your changes were not saved.",
    })
    openBoard(DEFAULT_BOARD_ID, true)
  }

  /** Loads the board as someone else saved it and moves the user's changes onto it. */
  const rebase = async (current: SettingsBase, during: "save" | "delete") => {
    if (!isOpen()) {
      fail(`Could not ${during} ${current.board.name}`, "Someone else changed it meanwhile")
      return
    }
    const key = boardQueryKey(org, current.board.id)
    try {
      await queryClient.cancelQueries({ queryKey: key })
      const theirs = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => fetchBoard(org, current.board.id),
      })
      setClash({ theirChanges: rebaseDraft(current, theirs, draft).theirChanges, during })
      setDraft((mine) => rebaseDraft(current, theirs, mine).draft)
      setBase(theirs)
      body.current?.scrollTo({ top: 0 })
    } catch (error) {
      if (isCode(error, "board_not_found")) boardGone(current)
      else
        setFailure(
          `Someone else changed this board, and it could not be loaded again: ${sentence(error instanceof Error ? error.message : String(error))}`,
        )
    }
  }

  const remove = (current: SettingsBase) => {
    if (pending) return
    setFailure(null)
    writes.remove
      .mutateAsync({ org, board: current.board.id, version: current.board.version })
      .then(
        () => {
          toast({
            tone: "success",
            title: `Deleted ${current.board.name}`,
            detail: "Its cards keep their order on every board.",
          })
          openBoard(DEFAULT_BOARD_ID, true)
        },
        (error: Error) => {
          if (isCode(error, "board_not_found")) {
            forgetBoard(org, current.board.id)
            void queryClient.invalidateQueries({ queryKey: boardsQueryKey(org) })
            toast({ tone: "info", title: `${current.board.name} was already deleted` })
            openBoard(DEFAULT_BOARD_ID, true)
          } else if (isCode(error, "board_changed")) {
            setConfirmingDelete(false)
            void rebase(current, "delete")
          } else {
            fail(`Could not delete ${current.board.name}`, error.message)
          }
        },
      )
  }

  const focusField = (field: "name" | "repos") => {
    if (field === "name") nameInput.current?.focus()
    else (repoSearch.current ?? reposSection.current)?.focus()
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (problem !== null) {
      setProblemShown(true)
      focusField(problem.field)
      return
    }
    setFailure(null)
    if (base === null) {
      writes.create.mutateAsync(toCreateRequest(org, draft)).then(
        (saved) => {
          toast({ tone: "success", title: `Created ${saved.name}` })
          openBoard(saved.id, false)
        },
        (error: Error) => fail("Could not create the board", error.message),
      )
      return
    }
    if (!isDirty(base, draft)) {
      close()
      return
    }
    writes.update
      .mutateAsync({ request: toUpdateRequest(org, base, draft), order: draft.order })
      .then(
        (saved) => {
          toast({ tone: "success", title: `Saved ${saved.name}` })
          close()
        },
        (error: Error) => {
          if (isCode(error, "board_changed")) void rebase(base, "save")
          else if (isCode(error, "board_not_found")) boardGone(base)
          else fail(`Could not save ${base.board.name}`, error.message)
        },
      )
  }

  const chosen = draft.repos.length + kept
  const rows = base === null ? [] : columnRows(base.allColumns, draft)
  const shown = rows.filter((row) => !row.hidden).length
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      // Chrome lets a second Escape in a row close the dialog although its cancel event is
      // prevented; preventing the key press keeps it open.
      onKeyDown={(event) => {
        if (event.key === "Escape" && pending) event.preventDefault()
      }}
      onCancel={(event) => {
        if (dragging.current || pending) event.preventDefault()
        // Escape backs out of the confirmation before it closes the dialog.
        else if (confirmingDelete) {
          event.preventDefault()
          setConfirmingDelete(false)
        }
      }}
      onClose={() => {
        onClose()
        // The browser gives focus back to what had it, or leaves it on <body> when that is gone,
        // such as the button of an empty board that now has repositories.
        window.setTimeout(() => {
          if (document.activeElement !== document.body) return
          document.querySelector<HTMLElement>('button[aria-label^="Board: "]')?.focus()
        })
      }}
      onClick={(event) => {
        if (event.target === dialog.current && !dirty && !pending) close()
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-1.5rem))] animate-palette-in overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-pop outline-none backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[3px] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:backdrop:bg-black/60"
    >
      <form
        onSubmit={save}
        // Enter submits from the name only; in the repository search or on a box it would save
        // the form before the user is done with it.
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            event.target instanceof HTMLInputElement &&
            event.target !== nameInput.current
          ) {
            event.preventDefault()
          }
        }}
        className="flex max-h-[calc(100dvh-2rem)] flex-col"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5 dark:border-zinc-800">
          <h2 id={`${id}-title`} className="text-[0.9375rem] font-semibold tracking-tight">
            {base === null ? "New board" : `Edit ${base.board.name}`}
          </h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            title={busy ?? "Close (Esc)"}
            aria-disabled={pending || undefined}
            aria-describedby={pending ? `${id}-busy` : undefined}
            className={`${buttonClass.iconSmall} -mr-1.5 aria-disabled:opacity-50`}
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div ref={body} className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {clash !== null && (
            <ErrorNotice tone="warning" title="Someone else saved this board while you edited it">
              {[
                clash.theirChanges.length === 0
                  ? ""
                  : `They changed ${describeFields(clash.theirChanges)}.`,
                clash.during === "save"
                  ? "Your changes are kept; check them and save again."
                  : "Check the board, and delete it again if you still want to.",
              ]
                .filter((part) => part !== "")
                .join(" ")}
            </ErrorNotice>
          )}

          <div>
            <label htmlFor={`${id}-name`} className={sectionTitle}>
              Name
            </label>
            <input
              ref={nameInput}
              id={`${id}-name`}
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              maxLength={MAX_BOARD_NAME}
              autoComplete="off"
              placeholder="For example, Design"
              aria-invalid={(problemShown && problem?.field === "name") || undefined}
              aria-describedby={
                problemShown && problem?.field === "name" ? `${id}-problem` : undefined
              }
              className={`${inputClass} mt-1.5`}
            />
          </div>

          <section
            ref={reposSection}
            tabIndex={-1}
            aria-labelledby={`${id}-repos`}
            className="focus:outline-none"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 id={`${id}-repos`} className={sectionTitle}>
                Repositories
              </h3>
              <span
                className={`text-xs tabular-nums ${
                  chosen > MAX_REPOS
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {chosen} of {MAX_REPOS}
                <span className="sr-only"> repositories at most</span>
              </span>
            </div>
            <p className={sectionHint}>
              Everyone who opens the board sees the issues of these repositories that they can read.
            </p>
            <div className="mt-2 rounded-xl border border-zinc-200 p-1.5 dark:border-zinc-800">
              {orgRepos.isError ? (
                <ErrorNotice
                  bare
                  title="Could not load the repositories"
                  onRetry={() => void orgRepos.refetch()}
                  retrying={orgRepos.isFetching}
                  className="p-2"
                >
                  {orgRepos.error.message}
                </ErrorNotice>
              ) : orgRepos.data === undefined ? (
                <div role="status" className="space-y-1.5 p-1">
                  <span className="sr-only">Loading the repositories</span>
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      aria-hidden="true"
                      className="h-7 animate-shimmer rounded-lg bg-zinc-100 dark:bg-zinc-800/70"
                    />
                  ))}
                </div>
              ) : (
                <RepoChecklist
                  repos={orgRepos.data}
                  selected={draft.repos}
                  onChange={(repos) => setDraft((current) => ({ ...current, repos }))}
                  legend="Repositories of the board"
                  searchRef={repoSearch}
                />
              )}
            </div>
            {unreadable > 0 && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                <LockIcon className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                <div className="min-w-0">
                  <p>
                    This board also has{" "}
                    {unreadable === 1 ? "1 repository" : `${unreadable} repositories`} you cannot
                    read. Members who can read {unreadable === 1 ? "it" : "them"} still see{" "}
                    {unreadable === 1 ? "it" : "them"}.
                  </p>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 pointer-coarse:min-h-11">
                    <input
                      type="checkbox"
                      checked={draft.dropUnreadable}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          dropUnreadable: event.target.checked,
                        }))
                      }
                      className="size-4 shrink-0 cursor-pointer rounded accent-indigo-600"
                    />
                    Remove {unreadable === 1 ? "it" : "them"} when I save
                  </label>
                </div>
              </div>
            )}
          </section>
          {base !== null && (
            <section aria-labelledby={`${id}-columns`}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={`${id}-columns`} className={sectionTitle}>
                  Columns
                </h3>
                <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {shown} of {rows.length} shown
                </span>
              </div>
              <p className={sectionHint}>
                Drag a column by its handle to move it. The board leaves out the cards of a hidden
                column; nothing changes in Forgejo.
              </p>
              <div className="mt-2 rounded-xl border border-zinc-200 p-1.5 dark:border-zinc-800">
                <ColumnSettings
                  rows={rows}
                  onMove={(key, index) => setDraft((current) => moveColumn(current, key, index))}
                  onHiddenChange={(key, hidden) =>
                    setDraft((current) => setColumnHidden(current, key, hidden))
                  }
                  onDraggingChange={(now) => {
                    if (now) dragging.current = true
                    // The cancel event of Escape comes after the drag has ended.
                    else window.setTimeout(() => (dragging.current = false))
                  }}
                  announcer={announcer}
                  firstCheckboxRef={firstColumnBox}
                />
              </div>
              {shown === 0 && rows.length > 0 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  The board shows no cards while every column is hidden.
                </p>
              )}
            </section>
          )}
          {base === null && (
            <p className={sectionHint}>
              The board starts with the default board's columns. Arrange them once it exists.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
          {failure !== null && (
            <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
              {failure}
            </p>
          )}
          {busy !== null && (
            <span id={`${id}-busy`} hidden>
              {busy}
            </span>
          )}
          {confirmingDelete && base !== null ? (
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
              <p id={`${id}-delete`} className="mr-auto text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  Delete {base.board.name}?
                </span>{" "}
                Cards and their order stay.
              </p>
              <div className="flex gap-2">
                <button
                  ref={keepButton}
                  type="button"
                  aria-describedby={pending ? `${id}-busy` : `${id}-delete`}
                  aria-disabled={pending || undefined}
                  onClick={() => {
                    if (!pending) setConfirmingDelete(false)
                  }}
                  className={`${buttonClass.secondary} aria-disabled:opacity-60`}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => remove(base)}
                  aria-describedby={`${id}-delete`}
                  aria-disabled={pending || undefined}
                  className={dangerButton}
                >
                  {writes.remove.isPending ? "Deleting…" : "Delete board"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {base !== null && base.board.id !== DEFAULT_BOARD_ID && (
                <button
                  ref={deleteButton}
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className={`${quietDangerButton} -ml-2.5`}
                >
                  Delete board…
                </button>
              )}
              <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {problem !== null && (
                  <p
                    id={`${id}-problem`}
                    className={`text-sm ${
                      problemShown
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {sentence(problem.message)}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={dismiss}
                    title={busy ?? undefined}
                    aria-disabled={pending || undefined}
                    aria-describedby={pending ? `${id}-busy` : undefined}
                    className={`${buttonClass.secondary} aria-disabled:opacity-60`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    aria-disabled={problem !== null || pending || undefined}
                    aria-describedby={problem !== null ? `${id}-problem` : undefined}
                    className={`${buttonClass.primary} aria-disabled:opacity-60`}
                  >
                    {base === null
                      ? pending
                        ? "Creating…"
                        : "Create board"
                      : pending
                        ? "Saving…"
                        : "Save"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </form>
    </dialog>
  )
}
