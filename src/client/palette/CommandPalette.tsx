import { Fragment, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation } from "wouter"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import { CheckIcon, XIcon } from "../ui/icons.tsx"
import { buttonClass, Kbd, touchTarget } from "../ui/primitives.tsx"
import { Glyph, SearchIcon } from "./icons.tsx"
import type { PaletteItem, RunContext } from "./item.ts"
import { isMac, Key } from "./keys.tsx"
import { rankSections } from "./rank.ts"
import { readRecent, rememberCommand } from "./recent.ts"
import { usePaletteGroups } from "./use-palette-groups.ts"

const CONFIRM_MS = 800

const KIND_NAMES = { issue: "issue", pull: "PR" } as const
// Open is neutral: green means done, and a closed issue or pull request may not be.
const STATE_DOTS = {
  open: "border-[1.5px] border-zinc-500 dark:border-zinc-400",
  closed: "bg-violet-500",
} as const

/** "Open PR" or "Closed issue": an issue and a pull request of the same title never look alike. */
const KindChip = ({ kind }: { kind: NonNullable<PaletteItem["kind"]> }) => (
  <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-1.5 text-2xs font-medium whitespace-nowrap text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
    <span aria-hidden="true" className={`size-2 rounded-full ${STATE_DOTS[kind.state]}`} />
    {kind.state === "open" ? "Open" : "Closed"} {KIND_NAMES[kind.type]}
  </span>
)

const Highlight = ({ text, indices }: { text: string; indices: ReadonlyArray<number> }) => {
  if (indices.length === 0) return text
  const marked = new Set(indices)
  const runs: Array<{ text: string; marked: boolean }> = []
  for (const [index, char] of Array.from(text).entries()) {
    const isMarked = marked.has(index)
    const last = runs.at(-1)
    if (last?.marked === isMarked) last.text += char
    else runs.push({ text: char, marked: isMarked })
  }
  return runs.map((run, index) =>
    run.marked ? (
      <mark
        // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional and never reorder
        key={index}
        className="bg-transparent font-semibold text-indigo-600 dark:text-indigo-300"
      >
        {run.text}
      </mark>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional and never reorder
      <Fragment key={index}>{run.text}</Fragment>
    ),
  )
}

/**
 * An issue's number stays visible when its long repository name is cut short. The reference
 * keeps `IssueRef`'s face, written out here so the matched characters can be marked.
 */
const Subtitle = ({ item, indices }: { item: PaletteItem; indices: ReadonlyArray<number> }) => {
  const text = item.subtitle ?? ""
  const split = item.icon === "issue" || item.icon === "pull" ? text.lastIndexOf("#") : -1
  if (split < 0) {
    return (
      <span className="block min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
        <Highlight text={text} indices={indices} />
      </span>
    )
  }
  return (
    <span className="flex min-w-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
      <span className="truncate">
        <Highlight text={text.slice(0, split)} indices={indices.filter((index) => index < split)} />
      </span>
      <span className="shrink-0">
        <Highlight
          text={text.slice(split)}
          indices={indices.filter((index) => index >= split).map((index) => index - split)}
        />
      </span>
    </span>
  )
}

type OptionProps = {
  readonly id: string
  readonly item: PaletteItem
  readonly titleIndices: ReadonlyArray<number>
  readonly subtitleIndices: ReadonlyArray<number>
  readonly active: boolean
  readonly onHover: () => void
  readonly onChoose: (alternate: boolean) => void
}

const Option = ({
  id,
  item,
  titleIndices,
  subtitleIndices,
  active,
  onHover,
  onChoose,
}: OptionProps) => (
  // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input owns the keyboard; options are driven through aria-activedescendant
  <div
    id={id}
    role="option"
    tabIndex={-1}
    aria-selected={active}
    data-active={active ? "" : undefined}
    onMouseMove={onHover}
    onMouseDown={(event) => event.preventDefault()}
    onClick={(event) => onChoose(event.metaKey || event.ctrlKey)}
    className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[1fr_auto] items-center rounded-lg px-2.5 py-2 data-active:bg-zinc-100 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] dark:data-active:bg-zinc-800"
  >
    <span className="col-start-1 row-span-2 row-start-1 mr-3 grid size-7 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-500 group-data-active:text-zinc-900 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-400 dark:group-data-active:text-zinc-100">
      {item.color === undefined ? (
        <Glyph name={item.icon} className="size-4" />
      ) : (
        <span
          aria-hidden="true"
          className="size-2.5 rounded-full"
          style={{ backgroundColor: item.color }}
        />
      )}
    </span>
    <span className="col-start-2 row-start-1 min-w-0 text-sm text-zinc-900 max-sm:line-clamp-2 sm:truncate dark:text-zinc-100">
      <Highlight text={item.title} indices={titleIndices} />
    </span>
    {/*
      One state chip: on a phone it follows the reference, which gives the title the width; wider,
      the line dissolves into the grid and the chip takes a column of its own.
    */}
    <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-2 empty:hidden max-sm:mt-0.5 sm:contents">
      {item.subtitle !== undefined && item.subtitle !== "" && (
        <span className="min-w-0 sm:col-start-2 sm:row-start-2">
          <Subtitle item={item} indices={subtitleIndices} />
        </span>
      )}
      {item.kind !== undefined && (
        <span className="shrink-0 sm:col-start-4 sm:row-span-2 sm:row-start-1 sm:ml-2">
          <KindChip kind={item.kind} />
        </span>
      )}
    </span>
    {item.hint !== undefined && (
      <span className="col-start-3 row-span-2 row-start-1 ml-3 text-xs text-zinc-500 max-sm:hidden dark:text-zinc-400">
        {item.hint}
      </span>
    )}
    <span className="col-start-3 row-span-2 row-start-1 ml-2 flex items-center gap-2 empty:hidden sm:col-start-5">
      {item.current !== undefined && (
        <span className="flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          <CheckIcon className="size-3.5" />
          {item.current}
        </span>
      )}
      {item.keys !== undefined && (
        <span className="inline-flex items-center gap-1 max-sm:hidden pointer-coarse:hidden">
          {item.keys.map((key) => (
            <Key key={key} name={key} />
          ))}
        </span>
      )}
      {/* An issue's row does not say where it opens; a repository's says "Open in Forgejo". */}
      {item.external === true && item.kind !== undefined && (
        <span className="sr-only"> (opens in Forgejo)</span>
      )}
      {item.external === true && (
        <Glyph
          name="external"
          // Always shown, so a row's destination is known before choosing it.
          className="size-3.5 text-zinc-400 group-data-active:text-zinc-600 dark:text-zinc-500 dark:group-data-active:text-zinc-300"
        />
      )}
    </span>
  </div>
)

const Spinner = () => (
  <span
    aria-hidden="true"
    className="size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-500 motion-reduce:animate-none dark:border-zinc-700 dark:border-t-indigo-400"
  />
)

type PaletteDialogProps = {
  readonly onClose: () => void
  readonly onOpenShortcuts: () => void
  readonly signOut: () => void
}

const PaletteDialog = ({ onClose, onOpenShortcuts, signOut }: PaletteDialogProps) => {
  const [, navigate] = useLocation()
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const recent = useMemo(readRecent, [])
  // The group being browsed, such as the board's labels: the palette lists all of it, alone.
  const [browsing, setBrowsing] = useState<string | null>(null)
  const { groups, searchStatus, searchError, retrySearch, minSearchLength } = usePaletteGroups(
    browsing === null ? query : "",
    true,
  )
  const browsed = groups.find((group) => group.id === browsing)

  const sections = useMemo(
    () =>
      (browsed === undefined
        ? rankSections(query, groups, recent)
        : rankSections(
            query,
            [{ ...browsed, limit: Number.POSITIVE_INFINITY, emptyLimit: Number.POSITIVE_INFINITY }],
            [],
          )
      ).filter((section) => section.rows.length > 0),
    [query, groups, recent, browsed],
  )
  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections])
  const activeIndex = Math.max(
    0,
    rows.findIndex((row) => row.item.id === activeId),
  )
  const active = rows[activeIndex]
  const optionId = (index: number) => `${listId}-option-${index}`

  useEffect(() => {
    const previous = document.activeElement
    const app = document.getElementById("root")
    if (app !== null) app.inert = true
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    input.current?.focus()
    return () => {
      if (app !== null) app.inert = false
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  useEffect(() => {
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" })
  }, [listId, activeIndex])

  useEffect(() => {
    if (notice === null || notice.failed) return
    const timer = window.setTimeout(onClose, CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [notice, onClose])

  const choose = (item: PaletteItem, alternate = false) => {
    if (item.remember) rememberCommand(item.id)
    let staying = false
    const context: RunContext = {
      navigate,
      openShortcuts: onOpenShortcuts,
      signOut,
      browse: (group) => {
        staying = true
        browse(group)
      },
      report: (task, success, failure) => {
        staying = true
        task.then(
          () => setNotice({ text: success, failed: false }),
          () => setNotice({ text: failure, failed: true }),
        )
      },
    }
    const run = (alternate ? item.alternate?.run : undefined) ?? item.run
    run(context)
    if (!staying) onClose()
  }

  /** Lists one group alone, or every group again with null, from an empty query. */
  const browse = (group: string | null) => {
    setBrowsing(group)
    setQuery("")
    setActiveId(null)
    input.current?.focus()
  }
  const stopBrowsing = () => browse(null)

  const move = (step: number) => {
    if (rows.length === 0) return
    const next = rows[(activeIndex + step + rows.length) % rows.length]
    if (next !== undefined) setActiveId(next.item.id)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return
    const control = event.ctrlKey && !event.metaKey && !event.altKey
    const modified = event.metaKey || event.ctrlKey
    if (event.key === "ArrowDown" || (control && event.key === "n")) {
      event.preventDefault()
      move(1)
    } else if (event.key === "ArrowUp" || (control && event.key === "p")) {
      event.preventDefault()
      move(-1)
    } else if (event.key === "Enter" && event.target === input.current) {
      event.preventDefault()
      if (active !== undefined) choose(active.item, modified)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (browsed === undefined) onClose()
      else stopBrowsing()
    } else if (
      event.key === "Backspace" &&
      event.target === input.current &&
      query === "" &&
      browsed !== undefined
    ) {
      event.preventDefault()
      stopBrowsing()
    } else if (event.key === "Tab") {
      // Options are reached with the arrow keys; Tab moves between the input and the buttons.
      event.preventDefault()
      const stops = [
        ...(dialog.current?.querySelectorAll<HTMLElement>("input, button:enabled") ?? []),
      ]
      const current = stops.indexOf(event.target as HTMLElement)
      stops[(current + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus()
    }
  }

  const issueCount = sections.find((section) => section.id === "issues")?.rows.length ?? 0
  // The search may find only issues that a board card or "Your work" already shows, which then
  // show there alone; with issues above, "no issues match" would read as a contradiction.
  const foundAbove =
    (groups.find((group) => group.id === "issues")?.items.length ?? 0) > 0 ||
    rows.some((row) => row.item.kind !== undefined)
  const searching = issueCount === 0 && searchStatus === "loading"
  const searchFailed = issueCount === 0 && searchStatus === "error"
  const nothingFound = rows.length === 0 && !searching && !searchFailed && query.trim() !== ""
  // The count answers a query; an empty list already says why it is empty.
  const showCount = query.trim() !== "" && rows.length > 0
  const resultCount = `${rows.length} ${rows.length === 1 ? "result" : "results"}`
  let optionIndex = -1

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop only dismisses the dialog; Escape does the same from the keyboard
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[min(12vh,7rem)] sm:px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 animate-palette-fade bg-zinc-950/40 backdrop-blur-[3px] dark:bg-black/60"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onKeyDown={onKeyDown}
        className="flex max-h-[min(34rem,calc(100dvh-8rem))] w-full max-w-xl animate-palette-in flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 shadow-[0_24px_64px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:shadow-[0_24px_64px_-12px_rgb(0_0_0/0.8)] dark:ring-white/5"
      >
        <div className="flex items-center gap-3 border-b border-zinc-200 pr-3 pl-4 dark:border-zinc-800">
          <SearchIcon className="size-[1.125rem] shrink-0 text-zinc-500 dark:text-zinc-400" />
          {browsed !== undefined && (
            <button
              type="button"
              onClick={stopBrowsing}
              aria-label={`${browsed.heading}. Back to all commands`}
              className={`${touchTarget} inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-zinc-100 pr-1.5 pl-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700`}
            >
              {browsed.heading}
              <XIcon className="size-3 opacity-70" />
            </button>
          )}
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active === undefined ? undefined : optionId(activeIndex)}
            aria-label={
              browsed === undefined
                ? "Search commands, repositories, issues, and pull requests"
                : `Search: ${browsed.heading}`
            }
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={browsed === undefined ? "Search or jump to…" : "Search…"}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveId(null)
            }}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-400"
          />
          {searchStatus === "loading" && <Spinner />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${buttonClass.ghost} shrink-0`}
          >
            {/* While a list is browsed, Esc goes back to all commands rather than closing. */}
            <span className="pointer-coarse:hidden">
              {browsed === undefined ? <Kbd>Esc</Kbd> : <XIcon className="size-4" />}
            </span>
            <span className="pointer-fine:hidden">Close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <div id={listId} role="listbox" aria-label="Results">
            {sections.map((section) => {
              const headingId = `${listId}-${section.id}`
              return (
                // biome-ignore lint/a11y/useSemanticElements: a listbox groups options with role=group
                <div
                  key={section.id}
                  role="group"
                  aria-labelledby={headingId}
                  className="mb-1 last:mb-0"
                >
                  <div
                    id={headingId}
                    role="presentation"
                    className="px-2.5 pt-2.5 pb-1 text-2xs font-medium text-zinc-500 dark:text-zinc-400"
                  >
                    {section.heading}
                  </div>
                  {section.rows.map((row) => {
                    optionIndex += 1
                    const index = optionIndex
                    return (
                      <Option
                        key={row.item.id}
                        id={optionId(index)}
                        item={row.item}
                        titleIndices={row.titleIndices}
                        subtitleIndices={row.subtitleIndices}
                        active={index === activeIndex}
                        onHover={() => setActiveId(row.item.id)}
                        onChoose={(alternate) => choose(row.item, alternate)}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
          {searching ? (
            <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Spinner />
              Searching every repository you can access…
            </p>
          ) : searchFailed ? (
            <ErrorNotice
              bare
              tone="warning"
              title="Could not search issues and pull requests"
              onRetry={() => {
                // The notice leaves while the search runs again; focus stays in the dialog.
                input.current?.focus()
                retrySearch()
              }}
              className="px-2.5 py-2"
            >
              {searchError}
            </ErrorNotice>
          ) : nothingFound ? (
            <div className="grid place-items-center gap-2 px-6 py-10 text-center">
              <SearchIcon className="size-6 text-zinc-400 dark:text-zinc-500" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Nothing matches “{query.trim()}”
              </p>
              {browsed === undefined && query.trim().length < minSearchLength && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Type {minSearchLength} characters to search issues and pull requests.
                </p>
              )}
            </div>
          ) : (
            searchStatus === "done" &&
            issueCount === 0 && (
              <p className="px-2.5 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                {foundAbove
                  ? "No other issues or pull requests match."
                  : "No issues or pull requests match."}
              </p>
            )
          )}
        </div>

        {/* Phones and touch screens get no key hints, and with no row there is nothing to move to. */}
        <div
          className={`flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400 ${
            notice !== null || showCount
              ? ""
              : active === undefined
                ? "hidden"
                : "max-sm:hidden pointer-coarse:hidden"
          }`}
        >
          {notice === null ? (
            active !== undefined && (
              <span className="hidden items-center gap-3 sm:flex pointer-coarse:hidden">
                <span className="flex items-center gap-1.5">
                  <Key name="↑" />
                  <Key name="↓" />
                  Navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <Key name="↵" />
                  {active?.item.enterLabel ??
                    (active?.item.external === true ? "Open in a new tab" : "Select")}
                </span>
                {active?.item.alternate !== undefined && (
                  <span className="flex items-center gap-1.5">
                    <Key name={isMac ? "⌘" : "Ctrl"} />
                    <Key name="↵" />
                    {active.item.alternate.label}
                  </span>
                )}
                {browsed !== undefined && (
                  <span className="flex items-center gap-1.5">
                    <Key name="Esc" />
                    Back
                  </span>
                )}
              </span>
            )
          ) : (
            <span
              className={`flex items-center gap-1.5 font-medium ${
                notice.failed
                  ? "text-red-700 dark:text-red-400"
                  : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              <Glyph name="link" className="size-3.5" />
              {notice.text}
            </span>
          )}
          {showCount && <span className="sm:ml-auto">{resultCount}</span>}
        </div>
        {/* A failed search announces itself in its notice. */}
        <div role="status" className="sr-only">
          {searchStatus === "loading"
            ? "Searching issues and pull requests"
            : query.trim() === "" || (searchFailed && rows.length === 0)
              ? ""
              : resultCount}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export const CommandPalette = ({ open, ...props }: { open: boolean } & PaletteDialogProps) =>
  open ? <PaletteDialog {...props} /> : null
