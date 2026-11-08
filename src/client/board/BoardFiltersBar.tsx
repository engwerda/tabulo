import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react"
import type { SetSearchParams } from "wouter"
import type { BoardCard } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { MilestoneIcon, SlidersIcon, TagIcon, UserIcon, XIcon } from "../ui/icons.tsx"
import { buttonClass, MenuOption, Popover } from "../ui/primitives.tsx"
import { SearchField } from "../ui/SearchField.tsx"
import { LabelName } from "./BoardCardView.tsx"
import {
  type BoardFilters,
  FILTER_PARAMS,
  filterChoices,
  isFiltered,
  ME,
  NONE,
} from "./board-view.ts"

type Choice = {
  readonly value: string
  /** The choice in words, which the search matches. */
  readonly label: string
  readonly icon?: ReactNode
  /** How the menu shows the label, when it differs from the words. */
  readonly display?: ReactNode
}

/**
 * One of the menu filters (assignee, label, milestone): what the desktop menu and the phone
 * sheet both render. With `multiple`, a card matches any chosen value.
 */
type FilterSpec = {
  readonly name: string
  readonly plural: string
  readonly icon: ReactNode
  readonly multiple: boolean
  readonly values: ReadonlyArray<string>
  readonly choices: ReadonlyArray<Choice>
  readonly onChange: (values: ReadonlyArray<string>) => void
}

/** The choices with values from the address kept selectable even when no card has them any more. */
const allChoices = ({ choices, values }: FilterSpec): ReadonlyArray<Choice> => [
  ...choices,
  ...values
    .filter((value) => !choices.some((choice) => choice.value === value))
    .map((value) => ({ value, label: value })),
]

const toggled = (values: ReadonlyArray<string>, value: string) =>
  values.includes(value) ? values.filter((other) => other !== value) : [...values, value]

const chipClass = (active: boolean) =>
  `inline-flex h-8 pointer-coarse:h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm font-medium transition ${
    active
      ? "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100/70 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/15"
      : "border-zinc-200 bg-white text-zinc-700 shadow-card hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/70"
  }`

/** A phone's active-filter chip: 36px tall, with a hit area reaching into the row gap to 44px. */
const chipTouch =
  "relative pointer-coarse:h-9 pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1"

/**
 * A filter's menu. With `multiple`, choices toggle and the menu stays open; otherwise picking a
 * choice replaces the value and closes the menu.
 */
const FilterMenu = ({ spec }: { spec: FilterSpec }) => {
  const { name, plural, icon, values, multiple, onChange } = spec
  const [query, setQuery] = useState("")
  const search = useRef<HTMLInputElement>(null)
  const all = allChoices(spec)
  const chosen = all.filter((choice) => values.includes(choice.value))
  const first = chosen[0]
  const shown = all.filter((choice) => choice.label.toLowerCase().includes(query.toLowerCase()))
  return (
    <Popover
      triggerClass={chipClass(values.length > 0)}
      containerClass="relative shrink-0"
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
            <SearchField
              label={`Search ${plural}`}
              value={query}
              onChange={setQuery}
              inputRef={search}
              inMenu
              className="mb-1"
            />
          )}
          {multiple && (
            <p className="px-2 pt-1 pb-1.5 text-2xs text-zinc-500 dark:text-zinc-400">
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
                      onChange(toggled(values, choice.value))
                      // Typing goes on into the search box after a pick.
                      search.current?.focus()
                    } else {
                      onChange([choice.value])
                      close()
                    }
                  }}
                >
                  {choice.icon}
                  <span className="min-w-0 flex-1 truncate">{choice.display ?? choice.label}</span>
                </MenuOption>
              )
            })}
            {shown.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                Nothing matches.
              </p>
            )}
          </div>
        </>
      )}
    </Popover>
  )
}

const sheetRow =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-left text-sm text-zinc-800 transition active:bg-zinc-100 dark:text-zinc-200 dark:active:bg-zinc-800"

/**
 * The phone's filters: a bottom sheet with every filter's choices as plain checkboxes or radio
 * buttons, since menus that open from inside a sheet would be cramped on a phone.
 */
const FilterSheet = ({
  open,
  onClose,
  mine,
  onToggleMine,
  specs,
  filtered,
  onClear,
  shown,
}: {
  open: boolean
  onClose: () => void
  mine: boolean
  onToggleMine: () => void
  specs: ReadonlyArray<FilterSpec>
  filtered: boolean
  onClear: () => void
  shown: number
}) => {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (element === null) return
    if (open && !element.open) {
      element.showModal()
      element.focus()
    }
    if (!open && element.open) element.close()
  }, [open])
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes a modal dialog natively; the click is on the backdrop
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
      tabIndex={-1}
      aria-labelledby="board-filters-title"
      className="mx-0 mt-auto mb-0 flex max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border-t border-zinc-200 bg-white p-0 text-zinc-900 shadow-pop backdrop:bg-zinc-950/40 focus:outline-none not-open:hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-100 pr-2 pl-4 dark:border-zinc-800">
        <h2 id="board-filters-title" className="text-[0.9375rem] font-semibold">
          Filters
        </h2>
        {filtered && (
          <button type="button" onClick={onClear} className={`${buttonClass.ghost} ml-auto`}>
            Clear all
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className={`${buttonClass.icon} ${filtered ? "" : "ml-auto"}`}
        >
          <XIcon />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-4">
        <label className={sheetRow}>
          <UserIcon className="size-4 text-zinc-500 dark:text-zinc-400" />
          <span className="flex-1">Assigned to me</span>
          <input
            type="checkbox"
            checked={mine}
            onChange={onToggleMine}
            className="size-4 accent-indigo-600"
          />
        </label>
        {specs.map((spec) => (
          <fieldset key={spec.name} className="mt-3">
            <legend className="px-2 pb-1 text-2xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              {spec.name}
            </legend>
            {allChoices(spec).map((choice) => (
              <label key={choice.value} className={sheetRow}>
                <span className="grid w-5 shrink-0 place-items-center">{choice.icon}</span>
                <span className="min-w-0 flex-1 truncate">{choice.display ?? choice.label}</span>
                <input
                  type={spec.multiple ? "checkbox" : "radio"}
                  name={spec.multiple ? undefined : `sheet-${spec.name}`}
                  checked={spec.values.includes(choice.value)}
                  onChange={() =>
                    spec.onChange(
                      spec.multiple ? toggled(spec.values, choice.value) : [choice.value],
                    )
                  }
                  // A chosen milestone is unchosen by tapping it again.
                  onClick={() => {
                    if (!spec.multiple && spec.values.includes(choice.value)) spec.onChange([])
                  }}
                  className="size-4 shrink-0 accent-indigo-600"
                />
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="shrink-0 border-t border-zinc-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800">
        <button type="button" onClick={onClose} className={`${buttonClass.primary} h-11 w-full`}>
          Show {shown} {shown === 1 ? "card" : "cards"}
        </button>
      </div>
    </dialog>
  )
}

type BoardFiltersBarProps = {
  readonly cards: ReadonlyArray<BoardCard>
  readonly filters: BoardFilters
  readonly setParams: SetSearchParams
  readonly searchInput: RefObject<HTMLInputElement | null>
  readonly shown: number
  readonly total: number
  readonly className?: string
}

/**
 * Search and filters. From the md breakpoint up every filter is a menu in the row; on a phone
 * the menus fold into one Filters button and sheet, and the active filters stay in sight below.
 */
export const BoardFiltersBar = ({
  cards,
  filters,
  setParams,
  searchInput,
  shown,
  total,
  className = "",
}: BoardFiltersBarProps) => {
  const [sheetOpen, setSheetOpen] = useState(false)
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
  const toggleMine = () => set("assignee", mine ? others : [ME, ...others])
  const filtered = isFiltered(filters)

  const specs: ReadonlyArray<FilterSpec> = [
    {
      name: "Assignee",
      plural: "people",
      multiple: true,
      icon: <UserIcon />,
      values: others,
      onChange: (values) => set("assignee", mine ? [ME, ...values] : values),
      choices: [
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
      ],
    },
    {
      name: "Label",
      plural: "labels",
      multiple: true,
      icon: <TagIcon />,
      values: filters.label,
      onChange: (values) => set("label", values),
      choices: [
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
          display: <LabelName name={name} />,
          icon: (
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          ),
        })),
      ],
    },
    {
      name: "Milestone",
      plural: "milestones",
      multiple: false,
      icon: <MilestoneIcon />,
      values: filters.milestone === null ? [] : [filters.milestone],
      onChange: (values) => set("milestone", values[0] ?? null),
      choices: [
        { value: NONE, label: "No milestone" },
        ...choices.milestones.map((milestone) => ({ value: milestone, label: milestone })),
      ],
    },
  ]

  // The phone's summary of active filters: each one removable on its own.
  const active = [
    ...(mine ? [{ key: "mine", label: "Assigned to me", remove: toggleMine }] : []),
    ...specs.flatMap((spec) =>
      allChoices(spec)
        .filter((choice) => spec.values.includes(choice.value))
        .map((choice) => ({
          key: `${spec.name}:${choice.value}`,
          label: choice.label,
          remove: () => spec.onChange(spec.values.filter((value) => value !== choice.value)),
        })),
    ),
  ]
  const menuFilterCount = active.length

  const count = (
    <p className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400" role="status">
      {filtered ? `${shown} of ${total} cards` : ""}
    </p>
  )

  return (
    <search className={`flex min-w-0 flex-col gap-2 ${className}`} aria-label="Filter cards">
      <div className="flex min-w-0 items-center gap-2 md:flex-wrap">
        <SearchField
          label="Search cards"
          value={filters.text}
          onChange={(text) => set("text", text)}
          inputRef={searchInput}
          shortcut="/"
          title="Search titles, or type #12 for issue 12"
          onKeyDown={(event) => {
            // On an empty search Escape goes to the first card; with text it clears the search.
            if (event.key === "Escape" && filters.text === "") {
              document.querySelector<HTMLElement>("a[data-card-link]")?.focus()
            }
          }}
          className="min-w-0 flex-1 md:w-52 md:flex-none min-[84rem]:w-auto min-[84rem]:max-w-52 min-[84rem]:min-w-36 min-[84rem]:flex-1"
        />

        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className={`${chipClass(menuFilterCount > 0)} md:hidden`}
        >
          <SlidersIcon className="size-4 opacity-70" />
          Filters
          {menuFilterCount > 0 && (
            <span className="tabular-nums">
              <span aria-hidden="true">· </span>
              {menuFilterCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 max-md:hidden">
          <button
            type="button"
            aria-pressed={mine}
            onClick={toggleMine}
            className={chipClass(mine)}
            title="Show only cards assigned to you (M)"
          >
            <UserIcon className="size-4 opacity-70" />
            Assigned to me
          </button>
          {specs.map((spec) => (
            <FilterMenu key={spec.name} spec={spec} />
          ))}
          {filtered && (
            <button type="button" onClick={clear} className={`${buttonClass.ghost} shrink-0`}>
              <XIcon className="size-3.5" />
              Clear
            </button>
          )}
          {/* The columns' counts show the result; this line is for screen readers. */}
          <div className="sr-only">{count}</div>
        </div>
      </div>

      {active.length > 0 && (
        <ul
          className="flex flex-wrap items-center gap-1.5 pointer-coarse:gap-2 md:hidden"
          aria-label="Active filters"
        >
          {active.map((filter) => (
            <li key={filter.key}>
              <button
                type="button"
                onClick={filter.remove}
                aria-label={`Remove filter ${filter.label}`}
                className={`inline-flex h-7 max-w-56 items-center gap-1 rounded-md bg-indigo-50 pr-1.5 pl-2 text-xs font-medium text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200 ${chipTouch}`}
              >
                <span className="truncate">{filter.label}</span>
                <XIcon className="size-3 shrink-0 opacity-70" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={clear}
              className={`inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 ${chipTouch}`}
            >
              Clear
            </button>
          </li>
          <li className="ml-auto">{count}</li>
        </ul>
      )}

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        mine={mine}
        onToggleMine={toggleMine}
        specs={specs}
        filtered={filtered}
        onClear={clear}
        shown={shown}
      />
    </search>
  )
}
