import { Fragment, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation } from "wouter"
import { Glyph, SearchIcon } from "./icons.tsx"
import { Kbd, ShortcutKeys } from "./keys.tsx"
import { rankSections } from "./rank.ts"
import { readRecent, rememberCommand } from "./recent.ts"
import {
  type Badge,
  type PaletteItem,
  type RunContext,
  usePaletteGroups,
} from "./use-palette-groups.ts"

const CONFIRM_MS = 800

const BADGE_TONES: Record<Badge["tone"], string> = {
  open: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  closed: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  current: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
}

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

const iconTone = (item: PaletteItem) =>
  item.icon === "pull"
    ? "text-emerald-600 dark:text-emerald-400"
    : item.icon === "issue"
      ? "text-sky-600 dark:text-sky-400"
      : "text-zinc-500 group-data-active:text-indigo-600 dark:text-zinc-400 dark:group-data-active:text-indigo-300"

/** An issue's number stays visible when its long repository name is cut short. */
const Subtitle = ({ item, indices }: { item: PaletteItem; indices: ReadonlyArray<number> }) => {
  const text = item.subtitle ?? ""
  const split = item.icon === "issue" || item.icon === "pull" ? text.lastIndexOf("#") : -1
  if (split < 0) {
    return (
      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
        <Highlight text={text} indices={indices} />
      </span>
    )
  }
  return (
    <span className="flex font-mono text-xs text-zinc-500 dark:text-zinc-400">
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
  readonly onChoose: () => void
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
    onClick={onChoose}
    className="group relative flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 data-active:bg-zinc-100 dark:data-active:bg-zinc-800/80"
  >
    <span
      aria-hidden="true"
      className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-indigo-500 opacity-0 group-data-active:opacity-100"
    />
    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_0_rgb(0_0_0/0.03)] dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-none">
      <Glyph name={item.icon} className={`size-4 ${iconTone(item)}`} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
        <Highlight text={item.title} indices={titleIndices} />
      </span>
      {item.subtitle !== undefined && item.subtitle !== "" && (
        <Subtitle item={item} indices={subtitleIndices} />
      )}
    </span>
    <span className="flex shrink-0 items-center gap-2">
      {item.badge !== undefined && (
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${BADGE_TONES[item.badge.tone]} ${item.badge.tone === "open" ? "hidden sm:block" : ""}`}
        >
          {item.badge.text}
        </span>
      )}
      {item.shortcut !== undefined && (
        <span className="hidden sm:block">
          <ShortcutKeys id={item.shortcut} />
        </span>
      )}
      {item.external === true && (
        <Glyph
          name="external"
          className="size-3.5 text-zinc-400 opacity-0 group-data-active:opacity-100 dark:text-zinc-500"
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
  const [notice, setNotice] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const keepOpen = useRef(false)
  const listId = useId()
  const recent = useMemo(readRecent, [])
  const { groups, searchStatus, searchError, minSearchLength } = usePaletteGroups(query, true)

  const sections = useMemo(() => {
    const ranked = rankSections(query, groups, recent)
    // The issue search group stays out of the way until the query is long enough to search.
    return ranked.filter(
      (section) => section.id !== "issues" || searchStatus !== "idle" || section.rows.length > 0,
    )
  }, [query, groups, recent, searchStatus])
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

  const context: RunContext = {
    navigate,
    openShortcuts: onOpenShortcuts,
    signOut,
    confirm: (message) => {
      keepOpen.current = true
      setNotice(message)
      window.setTimeout(onClose, CONFIRM_MS)
    },
  }

  const choose = (item: PaletteItem) => {
    if (item.remember) rememberCommand(item.id)
    item.run(context)
    if (!keepOpen.current) onClose()
  }

  const move = (step: number) => {
    if (rows.length === 0) return
    const next = rows[(activeIndex + step + rows.length) % rows.length]
    if (next !== undefined) setActiveId(next.item.id)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return
    const control = event.ctrlKey && !event.metaKey && !event.altKey
    if (event.key === "ArrowDown" || (control && event.key === "n")) {
      event.preventDefault()
      move(1)
    } else if (event.key === "ArrowUp" || (control && event.key === "p")) {
      event.preventDefault()
      move(-1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (active !== undefined) choose(active.item)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === "Tab") {
      // The input is the only stop; keeping Tab here is the focus trap.
      event.preventDefault()
      input.current?.focus()
    }
  }

  const issuesSection = sections.find((section) => section.id === "issues")
  const nothingFound = rows.length === 0 && searchStatus !== "loading" && query.trim() !== ""
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
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onKeyDown={onKeyDown}
        className="flex max-h-[min(34rem,calc(100dvh-8rem))] w-full max-w-xl animate-palette-in flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 shadow-[0_24px_64px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5 backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95 dark:shadow-[0_24px_64px_-12px_rgb(0_0_0/0.8)] dark:ring-white/5"
      >
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <SearchIcon className="size-[1.125rem] shrink-0 text-zinc-400 dark:text-zinc-500" />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active === undefined ? undefined : optionId(activeIndex)}
            aria-label="Search commands, repositories, issues, and pull requests"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Search or jump to…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveId(null)
            }}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {searchStatus === "loading" && <Spinner />}
          <Kbd>Esc</Kbd>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
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
                  className="px-2.5 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
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
                      onChoose={() => choose(row.item)}
                    />
                  )
                })}
                {section.id === "issues" && issuesSection?.rows.length === 0 && (
                  <p
                    className={`flex items-center gap-2 px-2.5 py-2 text-sm ${
                      searchStatus === "error"
                        ? "text-red-700 dark:text-red-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {searchStatus === "loading" && <Spinner />}
                    {searchStatus === "loading"
                      ? "Searching every repository you can access…"
                      : searchStatus === "error"
                        ? `Search failed: ${searchError ?? "try again"}`
                        : "No issues or pull requests match."}
                  </p>
                )}
              </div>
            )
          })}
          {nothingFound && (
            <div className="grid place-items-center gap-2 px-6 py-10 text-center">
              <SearchIcon className="size-6 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Nothing matches “{query.trim()}”
              </p>
              {query.trim().length < minSearchLength && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Type {minSearchLength} characters to search issues and pull requests.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/80 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
          {notice === null ? (
            <span className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                {active?.item.external === true ? "Open in a new tab" : "Select"}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <Glyph name="link" className="size-3.5" />
              {notice}
            </span>
          )}
          <span className="sm:ml-auto">
            {rows.length} {rows.length === 1 ? "result" : "results"}
          </span>
        </div>
        <div role="status" className="sr-only">
          {searchStatus === "loading"
            ? "Searching issues and pull requests"
            : `${rows.length} ${rows.length === 1 ? "result" : "results"}`}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export const CommandPalette = ({ open, ...props }: { open: boolean } & PaletteDialogProps) =>
  open ? <PaletteDialog {...props} /> : null
