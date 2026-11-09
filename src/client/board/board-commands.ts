import type { BoardCard } from "../../shared/api.ts"
import type { PaletteItem } from "../palette/item.ts"
import type { GroupSpec } from "../palette/rank.ts"
import { type BoardFilters, filterChoices, ME, NONE, toggled } from "./board-view.ts"

/** What the board's commands in the command menu read and do; the N, M, R, and / keys do the same. */
export type BoardCommandsInput = {
  readonly filtersShown: boolean
  readonly cards: ReadonlyArray<BoardCard>
  readonly filters: BoardFilters
  /** The column a new issue goes to, or null when the viewer cannot add one. */
  readonly newIssueColumn: string | null
  readonly newIssue: () => void
  readonly toggleMine: () => void
  readonly setFilter: (
    filter: "assignee" | "label" | "milestone",
    values: ReadonlyArray<string>,
  ) => void
  readonly clearFilters: () => void
  readonly focusSearch: () => void
  readonly refresh: () => void
  /** When the board was last read, in words. */
  readonly updated: string
  readonly boardName: string
  readonly editBoard: (() => void) | null
  readonly newBoard: (() => void) | null
}

const BROWSE = {
  label: "board:labels",
  assignee: "board:assignees",
  milestone: "board:milestones",
} as const

const on = (active: boolean) => (active ? { current: "On" as const } : {})

/**
 * The board's groups of commands: its actions first while the query is empty, and its filter
 * values, which a query finds and "Filter by label…" lists.
 */
export const boardCommands = (input: BoardCommandsInput): ReadonlyArray<GroupSpec<PaletteItem>> => {
  const { filters } = input
  const choices = filterChoices(input.cards)
  const mine = filters.assignee.includes(ME)
  const filtered =
    filters.assignee.length > 0 || filters.label.length > 0 || filters.milestone !== null

  const browseItem = (
    filter: keyof typeof BROWSE,
    title: string,
    icon: PaletteItem["icon"],
  ): PaletteItem => ({
    id: `board:filter-by:${filter}`,
    title,
    keywords: "filter",
    icon,
    remember: false,
    run: ({ browse }) => browse(BROWSE[filter]),
  })

  const refresh: PaletteItem = {
    id: "board:refresh",
    title: "Refresh the board",
    subtitle: input.updated,
    keywords: "reload update",
    icon: "refresh",
    keys: ["R"],
    remember: false,
    run: input.refresh,
  }
  const settings: ReadonlyArray<PaletteItem> = [
    ...(input.editBoard === null
      ? []
      : [
          {
            id: "board:edit",
            title: "Edit board",
            subtitle: input.boardName,
            keywords: "settings rename repositories columns hide order",
            icon: "settings",
            remember: false,
            run: input.editBoard,
          } satisfies PaletteItem,
        ]),
    ...(input.newBoard === null
      ? []
      : [
          {
            id: "board:new",
            title: "New board",
            keywords: "add create",
            icon: "plus",
            remember: false,
            run: input.newBoard,
          } satisfies PaletteItem,
        ]),
  ]

  const actions: ReadonlyArray<PaletteItem> = [
    ...(input.newIssueColumn === null
      ? []
      : [
          {
            id: "board:new-issue",
            title: "New issue",
            subtitle: `In ${input.newIssueColumn}`,
            keywords: "create add card",
            icon: "plus",
            keys: ["N"],
            remember: false,
            run: input.newIssue,
          } satisfies PaletteItem,
        ]),
    {
      id: "board:mine",
      title: "Assigned to me",
      subtitle: mine ? "Showing only your cards" : "Show only your cards",
      keywords: "filter mine my",
      icon: "person",
      keys: ["M"],
      ...on(mine),
      remember: false,
      run: input.toggleMine,
    },
    browseItem("label", "Filter by label…", "tag"),
    browseItem("assignee", "Filter by assignee…", "person"),
    browseItem("milestone", "Filter by milestone…", "milestone"),
    ...(filtered
      ? [
          {
            id: "board:clear-filters",
            title: "Clear filters",
            keywords: "reset remove filter",
            icon: "clear",
            remember: false,
            run: input.clearFilters,
          } satisfies PaletteItem,
        ]
      : []),
    // The empty palette cuts the list after `emptyLimit` items, so it drops Refresh and Search,
    // which have keys on the board, before the settings.
    ...settings,
    refresh,
    {
      id: "board:search",
      title: "Search cards",
      keywords: "find filter text",
      icon: "search",
      keys: ["/"],
      remember: false,
      run: input.focusSearch,
    },
  ]

  const toggle = (filter: "assignee" | "label", value: string) => () =>
    input.setFilter(filter, toggled(filters[filter], value))

  const labels: ReadonlyArray<PaletteItem> = [
    ...choices.labels.map(
      ({ name, color }): PaletteItem => ({
        id: `board:label:${name}`,
        title: name,
        keywords: "label filter",
        icon: "tag",
        color,
        ...on(filters.label.includes(name)),
        remember: false,
        run: toggle("label", name),
      }),
    ),
    {
      id: "board:label:none",
      title: "No label",
      keywords: "label filter none",
      icon: "tag",
      ...on(filters.label.includes(NONE)),
      remember: false,
      run: toggle("label", NONE),
    },
  ]

  const assignees: ReadonlyArray<PaletteItem> = [
    ...choices.assignees.map(
      ({ login }): PaletteItem => ({
        id: `board:assignee:${login}`,
        title: login,
        keywords: "assignee person filter",
        icon: "person",
        ...on(filters.assignee.includes(login)),
        remember: false,
        run: toggle("assignee", login),
      }),
    ),
    {
      id: "board:assignee:none",
      title: "No assignee",
      keywords: "assignee filter none nobody",
      icon: "person",
      ...on(filters.assignee.includes(NONE)),
      remember: false,
      run: toggle("assignee", NONE),
    },
  ]

  // A card has one milestone, so choosing one replaces the filter, and choosing it again clears it.
  const milestone = (value: string, title: string): PaletteItem => ({
    id: `board:milestone:${value}`,
    title,
    keywords: "milestone filter",
    icon: "milestone",
    ...on(filters.milestone === value),
    remember: false,
    run: () => input.setFilter("milestone", filters.milestone === value ? [] : [value]),
  })
  const milestones = [
    ...choices.milestones.map((title) => milestone(title, title)),
    milestone(NONE, "No milestone"),
  ]

  const filterGroup = (
    filter: keyof typeof BROWSE,
    heading: string,
    items: ReadonlyArray<PaletteItem>,
  ): GroupSpec<PaletteItem> => ({
    id: BROWSE[filter],
    heading,
    items,
    limit: 5,
    emptyLimit: 0,
    filter: true,
  })

  const board: GroupSpec<PaletteItem> = {
    id: "board",
    heading: "Board",
    items: input.filtersShown ? actions : [refresh, ...settings],
    limit: 8,
    emptyLimit: 8,
    filter: true,
    contextual: true,
  }
  if (!input.filtersShown) return [board]
  return [
    board,
    filterGroup("label", "Filter by label", labels),
    filterGroup("assignee", "Filter by assignee", assignees),
    filterGroup("milestone", "Filter by milestone", milestones),
  ]
}
