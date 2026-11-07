import { type ReactNode, type RefObject, useState } from "react"
import type { SetSearchParams } from "wouter"
import type { BoardCard } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { CheckIcon, MilestoneIcon, SearchIcon, TagIcon, UserIcon, XIcon } from "../ui/icons.tsx"
import { inputClass, Kbd, MenuOption, Popover } from "../ui/primitives.tsx"
import {
  type BoardFilters,
  FILTER_PARAMS,
  filterChoices,
  isFiltered,
  ME,
  NONE,
} from "./board-view.ts"

type Choice = { readonly value: string; readonly label: string; readonly icon?: ReactNode }

const chipClass = (active: boolean) =>
  `inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm font-medium transition ${
    active
      ? "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100/70 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/15"
      : "border-zinc-200 bg-white text-zinc-700 shadow-card hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/70"
  }`

const FilterMenu = ({
  name,
  icon,
  value,
  choices,
  onChange,
}: {
  name: string
  icon: ReactNode
  value: string | null
  choices: ReadonlyArray<Choice>
  onChange: (value: string | null) => void
}) => {
  const [search, setSearch] = useState("")
  // Keep a value from the address selectable even when no card has it any more.
  const all =
    value === null || choices.some((choice) => choice.value === value)
      ? choices
      : [...choices, { value, label: value }]
  const current = all.find((choice) => choice.value === value)
  const shown = all.filter((choice) => choice.label.toLowerCase().includes(search.toLowerCase()))
  return (
    <Popover
      triggerClass={chipClass(value !== null)}
      accessibleLabel={current === undefined ? `${name}: any` : `${name}: ${current.label}`}
      onOpenChange={(open) => {
        if (!open) setSearch("")
      }}
      label={
        <>
          <span className="opacity-70">{icon}</span>
          {current === undefined ? (
            name
          ) : (
            <span className="flex max-w-40 items-center gap-1.5">
              {current.icon}
              <span className="truncate">{current.label}</span>
            </span>
          )}
        </>
      }
      panelClass="w-64 p-1.5"
    >
      {(close) => (
        <>
          {all.length > 6 && (
            <label className="relative mb-1 block">
              <span className="sr-only">Find a {name.toLowerCase()}</span>
              <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-zinc-400" />
              <input
                // biome-ignore lint/a11y/noAutofocus: the menu opened to search it
                autoFocus
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Find a ${name.toLowerCase()}`}
                className={`${inputClass} pl-8 shadow-none`}
              />
            </label>
          )}
          <div role="menu" aria-label={name} className="scroll-thin max-h-72 overflow-y-auto">
            <MenuOption
              selected={value === null}
              onSelect={() => {
                onChange(null)
                close()
              }}
            >
              <span className="flex-1">Any {name.toLowerCase()}</span>
              {value === null && <CheckIcon className="size-4 text-indigo-600" />}
            </MenuOption>
            {shown.map((choice) => (
              <MenuOption
                key={choice.value}
                selected={choice.value === value}
                onSelect={() => {
                  onChange(choice.value)
                  close()
                }}
              >
                {choice.icon}
                <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                {choice.value === value && <CheckIcon className="size-4 text-indigo-600" />}
              </MenuOption>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-zinc-500">No {name.toLowerCase()} matches.</p>
            )}
          </div>
        </>
      )}
    </Popover>
  )
}

type BoardFiltersBarProps = {
  readonly cards: ReadonlyArray<BoardCard>
  readonly filters: BoardFilters
  readonly setParams: SetSearchParams
  readonly searchInput: RefObject<HTMLInputElement | null>
  readonly shown: number
  readonly total: number
}

export const BoardFiltersBar = ({
  cards,
  filters,
  setParams,
  searchInput,
  shown,
  total,
}: BoardFiltersBarProps) => {
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
  const clear = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const param of Object.values(FILTER_PARAMS)) next.delete(param)
        return next
      },
      { replace: true },
    )
  const mine = filters.assignee === ME

  return (
    <search
      className="scroll-thin flex items-center gap-2 overflow-x-auto px-4 pt-0.5 pb-3 sm:flex-wrap sm:overflow-visible sm:px-6"
      aria-label="Filter cards"
    >
      <label className="relative w-60 shrink-0 max-sm:w-48">
        <span className="sr-only">Search cards</span>
        <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-zinc-400" />
        <input
          ref={searchInput}
          type="search"
          value={filters.text}
          onChange={(event) => set("text", event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (filters.text !== "") set("text", null)
              event.currentTarget.blur()
            }
          }}
          placeholder="Search title or #number"
          className={`${inputClass} peer pr-8 pl-8`}
        />
        <span className="pointer-events-none absolute top-1.5 right-2 hidden peer-placeholder-shown:sm:block">
          <Kbd>/</Kbd>
        </span>
      </label>
      <button
        type="button"
        aria-pressed={mine}
        onClick={() => set("assignee", mine ? null : ME)}
        className={chipClass(mine)}
        title="Show only cards assigned to you (M)"
      >
        <UserIcon className="size-4 opacity-70" />
        Assigned to me
      </button>
      <FilterMenu
        name="Assignee"
        icon={<UserIcon />}
        value={mine ? null : filters.assignee}
        onChange={(value) => set("assignee", value)}
        choices={[
          {
            value: NONE,
            label: "No assignee",
            icon: (
              <span className="size-5 rounded-full border-[1.5px] border-dashed border-zinc-300 dark:border-zinc-600" />
            ),
          },
          ...choices.assignees.map(({ login, avatarUrl }) => ({
            value: login,
            label: login,
            icon: <Avatar url={avatarUrl} name={login} size="xs" />,
          })),
        ]}
      />
      <FilterMenu
        name="Label"
        icon={<TagIcon />}
        value={filters.label}
        onChange={(value) => set("label", value)}
        choices={choices.labels.map(({ name, color }) => ({
          value: name,
          label: name,
          icon: (
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          ),
        }))}
      />
      <FilterMenu
        name="Milestone"
        icon={<MilestoneIcon />}
        value={filters.milestone}
        onChange={(value) => set("milestone", value)}
        choices={[
          { value: NONE, label: "No milestone" },
          ...choices.milestones.map((milestone) => ({ value: milestone, label: milestone })),
        ]}
      />
      {isFiltered(filters) && (
        <>
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <XIcon className="size-3.5" />
            Clear
          </button>
          <p
            className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400"
            role="status"
          >
            {shown} of {total} cards
          </p>
        </>
      )}
    </search>
  )
}
