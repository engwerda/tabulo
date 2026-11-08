import { type ReactNode, type RefObject, useRef, useState } from "react"
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

/**
 * A filter's menu. With `multiple`, choices toggle and the menu stays open, and a card matches
 * any chosen value; otherwise picking a choice replaces the value and closes the menu.
 */
const FilterMenu = ({
  name,
  plural,
  icon,
  values,
  multiple,
  choices,
  onChange,
}: {
  name: string
  plural: string
  icon: ReactNode
  values: ReadonlyArray<string>
  multiple: boolean
  choices: ReadonlyArray<Choice>
  onChange: (values: ReadonlyArray<string>) => void
}) => {
  const [query, setQuery] = useState("")
  const search = useRef<HTMLInputElement>(null)
  // Keep values from the address selectable even when no card has them any more.
  const all: ReadonlyArray<Choice> = [
    ...choices,
    ...values
      .filter((value) => !choices.some((choice) => choice.value === value))
      .map((value) => ({ value, label: value })),
  ]
  const chosen = all.filter((choice) => values.includes(choice.value))
  const first = chosen[0]
  const shown = all.filter((choice) => choice.label.toLowerCase().includes(query.toLowerCase()))
  const toggle = (value: string) =>
    onChange(
      values.includes(value) ? values.filter((other) => other !== value) : [...values, value],
    )
  return (
    <Popover
      triggerClass={chipClass(values.length > 0)}
      accessibleLabel={
        chosen.length === 0 ? `${name}: any` : `${name}: ${chosen.map((c) => c.label).join(", ")}`
      }
      onOpenChange={(open) => {
        if (!open) setQuery("")
      }}
      label={
        <>
          <span className="opacity-70">{icon}</span>
          {first === undefined ? (
            name
          ) : (
            <span className="flex max-w-44 items-center gap-1.5">
              {first.icon}
              <span className="truncate">{first.label}</span>
              {chosen.length > 1 && (
                <span className="rounded bg-indigo-100 px-1 text-xs tabular-nums dark:bg-indigo-500/20">
                  +{chosen.length - 1}
                </span>
              )}
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
              <span className="sr-only">Search {plural}</span>
              <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-zinc-400" />
              <input
                type="search"
                ref={search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${plural}`}
                className={`${inputClass} pl-8 shadow-none`}
              />
            </label>
          )}
          {multiple && (
            <p className="px-2 pt-1 pb-1.5 text-[0.6875rem] text-zinc-500 dark:text-zinc-400">
              Shows cards with any of the chosen {plural}.
            </p>
          )}
          <div role="menu" aria-label={name} className="scroll-thin max-h-72 overflow-y-auto">
            <MenuOption
              selected={values.length === 0}
              multiple={multiple}
              onSelect={() => {
                onChange([])
                close()
              }}
            >
              <span className="flex-1">Any {name.toLowerCase()}</span>
              {values.length === 0 && <CheckIcon className="size-4 text-indigo-600" />}
            </MenuOption>
            {shown.map((choice) => {
              const on = values.includes(choice.value)
              return (
                <MenuOption
                  key={choice.value}
                  selected={on}
                  multiple={multiple}
                  onSelect={() => {
                    if (multiple) {
                      toggle(choice.value)
                      // Typing goes on into the search box after a pick.
                      search.current?.focus()
                    } else {
                      onChange([choice.value])
                      close()
                    }
                  }}
                >
                  {choice.icon}
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  {on && <CheckIcon className="size-4 text-indigo-600" />}
                </MenuOption>
              )
            })}
            {shown.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-zinc-500">Nothing matches.</p>
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
  const set = (filter: keyof BoardFilters, value: string | ReadonlyArray<string> | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(FILTER_PARAMS[filter])
        for (const one of value === null ? [] : typeof value === "string" ? [value] : value) {
          if (one !== "") next.append(FILTER_PARAMS[filter], one)
        }
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
  const mine = filters.assignee.includes(ME)
  const others = filters.assignee.filter((assignee) => assignee !== ME)

  return (
    <search
      className="scroll-thin flex items-center gap-2 overflow-x-auto px-4 pt-0.5 pb-3 *:shrink-0 max-xl:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:px-6 xl:flex-wrap xl:overflow-visible"
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
            // Escape clears the search and stays; on an empty search it goes to the first card.
            if (event.key === "Escape") {
              if (filters.text !== "") set("text", null)
              else document.querySelector<HTMLElement>("a[data-card-link]")?.focus()
            }
          }}
          placeholder="Search cards"
          title="Search titles, or type #12 for issue 12"
          aria-keyshortcuts="/"
          className={`${inputClass} peer pr-8 pl-8 [&::-webkit-search-cancel-button]:appearance-none`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 peer-placeholder-shown:sm:flex"
        >
          <Kbd>/</Kbd>
        </span>
        {filters.text !== "" && (
          <button
            type="button"
            onClick={() => {
              set("text", null)
              searchInput.current?.focus()
            }}
            aria-label="Clear the search"
            className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </label>
      <button
        type="button"
        aria-pressed={mine}
        onClick={() => set("assignee", mine ? others : [ME, ...others])}
        className={chipClass(mine)}
        title="Show only cards assigned to you (M)"
      >
        <UserIcon className="size-4 opacity-70" />
        Assigned to me
      </button>
      <FilterMenu
        name="Assignee"
        plural="people"
        multiple
        icon={<UserIcon />}
        values={others}
        onChange={(values) => set("assignee", mine ? [ME, ...values] : values)}
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
        plural="labels"
        multiple
        icon={<TagIcon />}
        values={filters.label}
        onChange={(values) => set("label", values)}
        choices={[
          {
            value: NONE,
            label: "No label",
            icon: (
              <span className="size-2.5 shrink-0 rounded-full border-[1.5px] border-dashed border-zinc-300 dark:border-zinc-600" />
            ),
          },
          ...choices.labels.map(({ name, color }) => ({
            value: name,
            label: name,
            icon: (
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            ),
          })),
        ]}
      />
      <FilterMenu
        name="Milestone"
        plural="milestones"
        multiple={false}
        icon={<MilestoneIcon />}
        values={filters.milestone === null ? [] : [filters.milestone]}
        onChange={(values) => set("milestone", values[0] ?? null)}
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
