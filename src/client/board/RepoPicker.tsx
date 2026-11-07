import { useEffect, useId, useRef, useState } from "react"
import type { OrgRepo } from "../../shared/api.ts"

type RepoPickerProps = {
  readonly repos: ReadonlyArray<OrgRepo>
  readonly selected: ReadonlyArray<string>
  readonly onChange: (selected: ReadonlyArray<string>) => void
}

export const RepoPicker = ({ repos, selected, onChange }: RepoPickerProps) => {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const selectAll = useRef<HTMLInputElement>(null)
  const panelId = useId()

  const chosen = new Set(selected)
  const visible = repos.filter((repo) => repo.name.toLowerCase().includes(search.toLowerCase()))
  const visibleChosen = visible.filter((repo) => chosen.has(repo.name)).length
  const allVisibleChosen = visible.length > 0 && visibleChosen === visible.length

  // Keeps the board's repository order stable whatever order the user clicks in.
  const choose = (isChosen: (name: string) => boolean) =>
    onChange(repos.map((repo) => repo.name).filter(isChosen))
  const toggle = (name: string) =>
    choose((candidate) => (candidate === name ? !chosen.has(name) : chosen.has(candidate)))
  const toggleVisible = () => {
    const shown = new Set(visible.map((repo) => repo.name))
    choose((candidate) => (shown.has(candidate) ? !allVisibleChosen : chosen.has(candidate)))
  }

  useEffect(() => {
    if (selectAll.current !== null) {
      selectAll.current.indeterminate = visibleChosen > 0 && !allVisibleChosen
    }
  })

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div ref={container} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        Repositories{" "}
        <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
          ({selected.length} of {repos.length})
        </span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        <label className="block">
          <span className="sr-only">Find a repository</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a repository"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        {visible.length > 0 && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 border-b border-zinc-200 px-2 pb-2 text-sm font-medium dark:border-zinc-700">
            <input
              ref={selectAll}
              type="checkbox"
              checked={allVisibleChosen}
              onChange={toggleVisible}
              className="accent-indigo-600"
            />
            {search === "" ? "Select all" : "Select all matches"}
            <span className="ml-auto text-xs font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
              {visibleChosen} of {visible.length}
            </span>
          </label>
        )}
        <fieldset className="mt-1 max-h-72 overflow-y-auto">
          <legend className="sr-only">Repositories on the board</legend>
          {visible.length === 0 ? (
            <p className="px-2 py-1 text-sm text-zinc-500">No repository matches.</p>
          ) : (
            visible.map((repo) => (
              <label
                key={repo.name}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={chosen.has(repo.name)}
                  onChange={() => toggle(repo.name)}
                  className="accent-indigo-600"
                />
                <span className="truncate">{repo.name}</span>
                {repo.archived && (
                  <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">archived</span>
                )}
              </label>
            ))
          )}
        </fieldset>
      </div>
    </div>
  )
}
