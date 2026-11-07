import type { SetSearchParams } from "wouter"
import type { BoardCard } from "../../shared/api.ts"
import { type BoardFilters, FILTER_PARAMS, filterChoices, isFiltered } from "./board-view.ts"

const controlClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"

type FilterSelectProps = {
  readonly label: string
  readonly value: string | null
  readonly options: ReadonlyArray<string>
  readonly onChange: (value: string | null) => void
}

const FilterSelect = ({ label, value, options, onChange }: FilterSelectProps) => (
  <label className="flex items-center gap-1.5 text-sm">
    <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
    <select
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      className={controlClass}
    >
      <option value="">Any</option>
      {/* Keep a value from the URL selectable even when no card has it any more. */}
      {[...new Set([...(value === null ? [] : [value]), ...options])].map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
)

type BoardFiltersBarProps = {
  readonly cards: ReadonlyArray<BoardCard>
  readonly filters: BoardFilters
  readonly setParams: SetSearchParams
}

export const BoardFiltersBar = ({ cards, filters, setParams }: BoardFiltersBarProps) => {
  const choices = filterChoices(cards)
  const set = (filter: keyof BoardFilters, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === null || value === "") next.delete(FILTER_PARAMS[filter])
        else next.set(FILTER_PARAMS[filter], value)
        return next
      },
      { replace: true },
    )
  return (
    <search className="flex flex-wrap items-center gap-3" aria-label="Filter cards">
      <label className="text-sm">
        <span className="sr-only">Search cards</span>
        <input
          type="search"
          value={filters.text}
          onChange={(event) => set("text", event.target.value)}
          placeholder="Search title or #number"
          className={`${controlClass} w-56`}
        />
      </label>
      <FilterSelect
        label="Assignee"
        value={filters.assignee}
        options={choices.assignees}
        onChange={(value) => set("assignee", value)}
      />
      <FilterSelect
        label="Milestone"
        value={filters.milestone}
        options={choices.milestones}
        onChange={(value) => set("milestone", value)}
      />
      <FilterSelect
        label="Label"
        value={filters.label}
        options={choices.labels}
        onChange={(value) => set("label", value)}
      />
      {isFiltered(filters) && (
        <button
          type="button"
          onClick={() =>
            setParams(
              (current) => {
                const next = new URLSearchParams(current)
                for (const param of Object.values(FILTER_PARAMS)) next.delete(param)
                return next
              },
              { replace: true },
            )
          }
          className="rounded-md px-2 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          Clear filters
        </button>
      )}
    </search>
  )
}
