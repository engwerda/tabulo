import { useEffect, useRef, useState } from "react"
import type { OrgRepo } from "../../shared/api.ts"
import { ArchiveIcon, LockIcon, RepoIcon, SearchIcon } from "../ui/icons.tsx"
import { buttonClass, inputClass, Popover } from "../ui/primitives.tsx"
import { useRepoColor } from "../ui/repo-palette.tsx"

type RepoPickerProps = {
  readonly repos: ReadonlyArray<OrgRepo>
  readonly selected: ReadonlyArray<string>
  readonly onChange: (selected: ReadonlyArray<string>) => void
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

const checkboxClass = "size-4 shrink-0 cursor-pointer rounded accent-indigo-600"
const rowClass =
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm transition hover:bg-zinc-100 has-focus-visible:bg-zinc-100 dark:hover:bg-zinc-800 dark:has-focus-visible:bg-zinc-800"

const RepoDot = ({ repo, chosen }: { repo: string; chosen: boolean }) => {
  const color = useRepoColor(repo)
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-[2px] bg-zinc-300 dark:bg-zinc-600"
      style={chosen ? { backgroundColor: color } : undefined}
    />
  )
}

export const RepoPicker = ({ repos, selected, onChange, open, onOpenChange }: RepoPickerProps) => {
  const [search, setSearch] = useState("")
  const selectAll = useRef<HTMLInputElement>(null)

  const chosen = new Set(selected)
  const visible = repos.filter((repo) => repo.name.toLowerCase().includes(search.toLowerCase()))
  const visibleChosen = visible.filter((repo) => chosen.has(repo.name)).length
  const allVisibleChosen = visible.length > 0 && visibleChosen === visible.length

  // Keeps the organization's repository order stable whatever order the user clicks in.
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

  const summary =
    selected.length === 0
      ? "Choose repositories"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} repositories`

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSearch("")
      }}
      triggerClass={`${buttonClass.secondary} min-w-0 max-w-60 shrink-0`}
      accessibleLabel={`Repositories: ${selected.length} of ${repos.length} chosen`}
      label={
        <>
          <RepoIcon className="size-4 opacity-70" />
          <span className="truncate max-sm:hidden">{summary}</span>
          <span className="whitespace-nowrap tabular-nums sm:hidden">
            {selected.length} {selected.length === 1 ? "repo" : "repos"}
          </span>
        </>
      }
      panelClass="w-80 p-1.5"
    >
      {() => (
        <>
          <label className="relative block">
            <span className="sr-only">Search repositories</span>
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-zinc-500 dark:text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search repositories"
              className={`${inputClass} pl-8 shadow-none`}
            />
          </label>
          {visible.length > 0 && (
            <div className="mt-1.5 mb-1 border-b border-zinc-100 pb-1 dark:border-zinc-800">
              <label className={`${rowClass} h-9 font-medium pointer-coarse:h-11`}>
                <input
                  ref={selectAll}
                  type="checkbox"
                  checked={allVisibleChosen}
                  onChange={toggleVisible}
                  className={checkboxClass}
                />
                {search === "" ? "Select all" : "Select all matches"}
                <span className="ml-auto text-xs font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
                  {visibleChosen} of {visible.length}
                </span>
              </label>
            </div>
          )}
          <fieldset className="scroll-thin max-h-72 overflow-y-auto">
            <legend className="sr-only">Repositories on the board</legend>
            {visible.length === 0 ? (
              <p className="px-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                No repository matches “{search.trim()}”.
              </p>
            ) : (
              visible.map((repo) => (
                <label key={repo.name} className={`${rowClass} h-8 pointer-coarse:h-11`}>
                  <input
                    type="checkbox"
                    checked={chosen.has(repo.name)}
                    onChange={() => toggle(repo.name)}
                    className={checkboxClass}
                  />
                  <RepoDot repo={repo.name} chosen={chosen.has(repo.name)} />
                  <span
                    className={`truncate ${repo.archived ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}`}
                  >
                    {repo.name}
                  </span>
                  {repo.private && (
                    <span title="Private" className="text-zinc-500 dark:text-zinc-400">
                      <LockIcon className="size-3.5" />
                      <span className="sr-only">private</span>
                    </span>
                  )}
                  {repo.archived && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-200 px-1.5 text-2xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                      <ArchiveIcon className="size-3" />
                      Archived
                    </span>
                  )}
                </label>
              ))
            )}
          </fieldset>
        </>
      )}
    </Popover>
  )
}
