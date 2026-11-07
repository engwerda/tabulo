import { useState } from "react"
import type { OrgRepo } from "../../shared/api.ts"

type RepoPickerProps = {
  readonly repos: ReadonlyArray<OrgRepo>
  readonly selected: ReadonlyArray<string>
  readonly onChange: (selected: ReadonlyArray<string>) => void
  readonly defaultOpen: boolean
}

export const RepoPicker = ({ repos, selected, onChange, defaultOpen }: RepoPickerProps) => {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(defaultOpen)
  const chosen = new Set(selected)
  const visible = repos.filter((repo) => repo.name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (name: string) =>
    onChange(
      repos
        .map((repo) => repo.name)
        .filter((candidate) => (candidate === name ? !chosen.has(name) : chosen.has(candidate))),
    )
  return (
    <details
      className="group relative"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
        Repositories{" "}
        <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
          ({selected.length} of {repos.length})
        </span>
      </summary>
      <div className="absolute z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
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
        <fieldset className="mt-2 max-h-72 overflow-y-auto">
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
    </details>
  )
}
