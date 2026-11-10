import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import type { BoardCard, BoardColumn, IssueOptions } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { fetchIssueOptions, setAssignee, setLabel, setMilestone } from "../api.ts"
import { absoluteTime, relativeTime } from "../format.ts"
import { IssuePanel, Property } from "../issue/IssuePanel.tsx"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import { ChevronDownIcon, LockIcon, UserMinusIcon, UserPlusIcon } from "../ui/icons.tsx"
import { LabelChip, LabelList } from "../ui/LabelChip.tsx"
import { buttonClass, MenuOption, Popover } from "../ui/primitives.tsx"
import { SearchField } from "../ui/SearchField.tsx"
import { ColumnDot, LabelName, RepoIssueRef } from "./BoardCardView.tsx"
import type { CardUpdate } from "./BoardPage.tsx"

const editTrigger =
  "inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-zinc-100 disabled:pointer-events-none pointer-coarse:min-h-11 dark:hover:bg-zinc-800/70"

type Choice = {
  readonly value: string
  /** The choice in words, which the search matches. */
  readonly label: string
  readonly icon?: ReactNode
  /** How the menu shows the label, when it differs from the words. */
  readonly display?: ReactNode
}

/** The choices come from one request per repository, which can still be on its way or fail. */
type Choices =
  | { readonly status: "pending" }
  | {
      readonly status: "failed"
      readonly reason: string
      readonly retry: () => void
      readonly retrying: boolean
    }
  | { readonly status: "ready"; readonly list: ReadonlyArray<Choice> }

/** A searchable menu of choices: several stay picked for labels and assignees, one for others. */
const Picker = ({
  name,
  valueText,
  searchName,
  trigger,
  choices,
  picked,
  multiple,
  onPick,
  disabled,
}: {
  name: string
  /** The current value in words, which the trigger's accessible name includes. */
  valueText: string
  /** The plural the search box names, such as "labels". */
  searchName: string
  /** The value's items, such as label chips, each with a key; they wrap as one row. */
  trigger: ReadonlyArray<ReactNode>
  choices: Choices
  picked: ReadonlySet<string>
  multiple: boolean
  onPick: (value: string) => void
  disabled: boolean
}) => {
  const [search, setSearch] = useState("")
  const shown = (choices.status === "ready" ? choices.list : []).filter((choice) =>
    choice.label.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <Popover
      // The chevron stays beside the last item when the items wrap, as it does after one item.
      chevron={false}
      label={
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {trigger.slice(0, -1)}
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {trigger.at(-1)}
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
          </span>
        </span>
      }
      accessibleLabel={`${name}: ${valueText}. Change`}
      triggerClass={editTrigger}
      containerClass="relative min-w-0"
      panelClass="w-64 p-1.5"
      onOpenChange={(open) => {
        if (!open) setSearch("")
      }}
    >
      {(close) =>
        choices.status === "failed" ? (
          <ErrorNotice
            bare
            title={`Could not load ${searchName}`}
            onRetry={choices.retry}
            retrying={choices.retrying}
            // The panel is too narrow for Retry beside the reason; below it, it lines up with it.
            className="p-1.5 [&>button]:ml-11"
          >
            {choices.reason}
          </ErrorNotice>
        ) : (
          <>
            <SearchField
              label={`Search ${searchName}`}
              value={search}
              onChange={setSearch}
              inMenu
              className="mb-1"
            />
            <div role="menu" aria-label={name} className="scroll-thin max-h-72 overflow-y-auto">
              {choices.status === "pending" && (
                <div role="status" className="space-y-1 p-1">
                  <span className="sr-only">Loading {searchName}</span>
                  {["w-3/5", "w-4/5", "w-2/5"].map((width) => (
                    <div
                      key={width}
                      className="flex h-8 items-center gap-2 px-1 pointer-coarse:h-11"
                    >
                      <span className="size-4 shrink-0 animate-shimmer rounded-full bg-zinc-200 dark:bg-zinc-800" />
                      <span
                        className={`h-3 animate-shimmer rounded bg-zinc-200 dark:bg-zinc-800 ${width}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              {shown.map((choice) => (
                <MenuOption
                  key={choice.value}
                  selected={picked.has(choice.value)}
                  multiple={multiple}
                  disabled={disabled}
                  onSelect={() => {
                    // Disabling the item would drop its focus to the page while a change saves.
                    if (disabled) return
                    onPick(choice.value)
                    if (!multiple) close()
                  }}
                >
                  {choice.icon}
                  <span className="min-w-0 flex-1 truncate">{choice.display ?? choice.label}</span>
                </MenuOption>
              ))}
              {choices.status === "ready" && shown.length === 0 && (
                <p className="px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                  Nothing matches.
                </p>
              )}
            </div>
          </>
        )
      }
    </Popover>
  )
}

type CardPanelProps = {
  readonly org: string
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly viewer: string
  readonly movable: boolean
  /**
   * Position among the shown cards of its column, for the previous and next buttons. A card the
   * filters hide still counts, so stepping starts from it.
   */
  readonly position: {
    readonly index: number
    readonly count: number
    readonly hiddenByFilters: boolean
  }
  readonly onStep: (step: -1 | 1) => void
  readonly onMoveTo: (column: string) => void
  readonly onToggleAssigned: () => void
  /** Runs a change to the card's labels, milestone, or assignees and shows its result. */
  readonly onUpdate: (change: CardUpdate) => void
  /** The card with its new comment count after the viewer commented. */
  readonly onCommented: (card: BoardCard) => void
  readonly updating: boolean
  readonly onClose: () => void
}

/** The issue panel with the board's own controls: the card's column, its edits, and stepping. */
export const CardPanel = ({
  org,
  card,
  columns,
  viewer,
  movable,
  position,
  onStep,
  onMoveTo,
  onToggleAssigned,
  onUpdate,
  onCommented,
  updating,
  onClose,
}: CardPanelProps) => {
  const editable = card.readOnlyReason === null
  const options = useQuery({
    queryKey: ["issue-options", org, card.repo],
    queryFn: () => fetchIssueOptions(org, card.repo),
    staleTime: 5 * 60_000,
    enabled: editable,
  })
  const column = columns.find((candidate) => candidate.key === card.column)
  const assigned = card.assignees.some((assignee) => assignee.login === viewer)
  const closed = card.state === "closed"
  const ref = { org, repo: card.repo, number: card.number }
  const name = `${card.repo}#${card.number}`

  const choicesFrom = (build: (data: IssueOptions) => ReadonlyArray<Choice>): Choices =>
    options.data !== undefined
      ? { status: "ready", list: build(options.data) }
      : options.isError
        ? {
            status: "failed",
            reason: options.error.message,
            retry: () => void options.refetch(),
            retrying: options.isFetching,
          }
        : { status: "pending" }
  // The card's own assignees stay choosable even when Forgejo no longer offers them.
  const assigneeChoices = choicesFrom((data) =>
    [
      ...new Map(
        [...card.assignees, ...data.assignees].map((person) => [person.login, person]),
      ).values(),
    ].map((person) => ({
      value: person.login,
      label: person.login === viewer ? `${person.login} (you)` : person.login,
      icon: <Avatar url={person.avatarUrl} name={person.login} size="xs" />,
    })),
  )
  const labelChoices = choicesFrom((data) =>
    data.labels.map((label) => ({
      value: String(label.id),
      label: label.name,
      display: <LabelName name={label.name} />,
      icon: (
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      ),
    })),
  )
  const milestoneChoices = choicesFrom((data) => [
    { value: "", label: "No milestone" },
    ...data.milestones.map((milestone) => ({
      value: String(milestone.id),
      label: milestone.title,
    })),
  ])
  // A closed milestone is not among the choices, so nothing is ticked rather than "No milestone".
  const currentMilestone = options.data?.milestones.find(
    (milestone) => milestone.title === card.milestone,
  )
  const pickedMilestone =
    card.milestone === null
      ? ""
      : currentMilestone === undefined
        ? null
        : String(currentMilestone.id)

  return (
    <IssuePanel
      issue={{
        key: card.key,
        owner: org,
        repo: card.repo,
        number: card.number,
        kind: "issue",
        title: card.title,
        url: card.url,
        closed,
      }}
      name={name}
      reference={<RepoIssueRef repo={card.repo} number={card.number} />}
      placement="beside"
      canComment={editable}
      headerControls={
        <>
          <span className="mr-1.5 hidden text-xs text-zinc-500 tabular-nums sm:inline dark:text-zinc-400">
            {position.hiddenByFilters
              ? "Hidden by filters"
              : position.count > 0 &&
                position.index >= 0 &&
                `${position.index + 1} of ${position.count}`}
          </span>
          <button
            type="button"
            onClick={() => onStep(-1)}
            disabled={position.index <= 0}
            aria-label="Previous card in the column"
            title="Previous card (K)"
            className={buttonClass.icon}
          >
            <ChevronDownIcon className="size-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={position.index >= position.count - 1}
            aria-label="Next card in the column"
            title="Next card (J)"
            className={buttonClass.icon}
          >
            <ChevronDownIcon className="size-4" />
          </button>
          <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
        </>
      }
      properties={
        <>
          <Property name="Status">
            {movable ? (
              <Popover
                chevron={false}
                accessibleLabel={`Status: ${column?.title ?? card.column}. Move to another column`}
                triggerClass={`${editTrigger} font-medium`}
                containerClass="relative min-w-0"
                panelClass="w-56 p-1"
                focusFirstItem
                label={
                  <>
                    {column !== undefined && <ColumnDot column={column} />}
                    <span className="truncate">{column?.title ?? card.column}</span>
                    <ChevronDownIcon className="size-3.5 text-zinc-400" />
                  </>
                }
              >
                {(close) => (
                  <div role="menu" aria-label="Move to column">
                    {columns.map((option) => (
                      <MenuOption
                        key={option.key}
                        selected={option.key === card.column}
                        onSelect={() => {
                          close()
                          onMoveTo(option.key)
                        }}
                      >
                        <ColumnDot column={option} />
                        <span className="min-w-0 flex-1 truncate">{option.title}</span>
                      </MenuOption>
                    ))}
                  </div>
                )}
              </Popover>
            ) : (
              <span className="inline-flex items-center gap-2 px-1.5 py-1 font-medium">
                {column !== undefined && <ColumnDot column={column} />}
                {column?.title ?? card.column}
                {card.readOnlyReason === "archived" && (
                  <span className="flex items-center gap-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    <LockIcon className="size-3" /> archived repository
                  </span>
                )}
              </span>
            )}
          </Property>

          <Property name="Assignees">
            <div className="flex flex-wrap items-center gap-1">
              {editable ? (
                <Picker
                  name="Assignees"
                  valueText={card.assignees.map((person) => person.login).join(", ") || "nobody"}
                  searchName="assignees"
                  multiple
                  disabled={updating}
                  choices={assigneeChoices}
                  picked={new Set(card.assignees.map((person) => person.login))}
                  onPick={(login) => {
                    const on = card.assignees.some((person) => person.login === login)
                    const set = (to: boolean) => () => setAssignee({ ...ref, login, assigned: to })
                    onUpdate({
                      run: set(!on),
                      undo: {
                        run: set(on),
                        done: on
                          ? `Assigned ${login} to ${name}`
                          : `Unassigned ${login} from ${name}`,
                      },
                      issue: name,
                      done: on
                        ? `Unassigned ${login} from ${name}`
                        : `Assigned ${login} to ${name}`,
                    })
                  }}
                  trigger={
                    card.assignees.length === 0
                      ? [
                          <span key="nobody" className="text-zinc-500 dark:text-zinc-400">
                            Nobody
                          </span>,
                        ]
                      : card.assignees.map((person) => (
                          <span
                            key={person.login}
                            className="flex items-center gap-1.5 not-last:mr-1.5"
                          >
                            <Avatar url={person.avatarUrl} name={person.login} size="xs" />
                            {person.login}
                          </span>
                        ))
                  }
                />
              ) : (
                <span className="px-1.5 py-1 text-zinc-500 dark:text-zinc-400">
                  {card.assignees.map((person) => person.login).join(", ") || "Nobody"}
                </span>
              )}
              {editable && !closed && (
                <button
                  type="button"
                  onClick={onToggleAssigned}
                  disabled={updating}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60 pointer-coarse:min-h-11 pointer-coarse:px-2.5 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                >
                  {assigned ? (
                    <UserMinusIcon className="size-3.5" />
                  ) : (
                    <UserPlusIcon className="size-3.5" />
                  )}
                  {assigned ? "Unassign me" : "Assign me"}
                </button>
              )}
            </div>
          </Property>

          <Property name="Labels">
            {editable ? (
              <Picker
                name="Labels"
                valueText={card.labels.map((label) => label.name).join(", ") || "none"}
                searchName="labels"
                multiple
                disabled={updating}
                choices={labelChoices}
                picked={new Set(card.labels.map((label) => String(label.id)))}
                onPick={(id) => {
                  const on = card.labels.some((label) => String(label.id) === id)
                  const labelName =
                    options.data?.labels.find((label) => String(label.id) === id)?.name ?? "label"
                  const set = (to: boolean) => () =>
                    setLabel({ ...ref, labelId: Number(id), present: to })
                  onUpdate({
                    run: set(!on),
                    undo: {
                      run: set(on),
                      done: on
                        ? `Added ${labelName} to ${name}`
                        : `Removed ${labelName} from ${name}`,
                    },
                    issue: name,
                    done: on
                      ? `Removed ${labelName} from ${name}`
                      : `Added ${labelName} to ${name}`,
                  })
                }}
                trigger={
                  card.labels.length === 0
                    ? [
                        <span key="none" className="text-zinc-500 dark:text-zinc-400">
                          None
                        </span>,
                      ]
                    : card.labels.map((label) => (
                        <LabelChip key={label.id} name={label.name} color={label.color} size="md" />
                      ))
                }
              />
            ) : (
              <LabelList labels={card.labels} size="md" className="px-1.5 py-1" />
            )}
          </Property>

          <Property name="Milestone">
            {editable ? (
              <Picker
                name="Milestone"
                valueText={card.milestone ?? "none"}
                searchName="milestones"
                multiple={false}
                disabled={updating}
                choices={milestoneChoices}
                picked={new Set(pickedMilestone === null ? [] : [pickedMilestone])}
                onPick={(id) => {
                  const to = id === "" ? null : Number(id)
                  const title = options.data?.milestones.find(
                    (milestone) => milestone.id === to,
                  )?.title
                  // A closed milestone has no choice to go back to, so it gets no Undo.
                  const back = card.milestone === null ? null : (currentMilestone?.id ?? undefined)
                  const backTitle = card.milestone
                  onUpdate({
                    run: () => setMilestone({ ...ref, milestoneId: to }),
                    ...(back === undefined
                      ? {}
                      : {
                          undo: {
                            run: () => setMilestone({ ...ref, milestoneId: back }),
                            done:
                              backTitle === null
                                ? `Cleared the milestone of ${name}`
                                : `Set ${name}'s milestone back to ${backTitle}`,
                          },
                        }),
                    issue: name,
                    done:
                      title === undefined
                        ? `Cleared the milestone of ${name}`
                        : `Set ${name}'s milestone to ${title}`,
                  })
                }}
                trigger={[
                  card.milestone === null ? (
                    <span key="none" className="text-zinc-500 dark:text-zinc-400">
                      None
                    </span>
                  ) : (
                    <span key="milestone">{card.milestone}</span>
                  ),
                ]}
              />
            ) : (
              <span className="block px-1.5 py-1">{card.milestone ?? "None"}</span>
            )}
          </Property>

          <Property name="Opened">
            <span className="flex flex-wrap items-center gap-1.5 px-1.5 py-1">
              <Avatar url={card.author.avatarUrl} name={card.author.login} size="xs" />
              {card.author.login}
              <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-500">
                ·
              </span>
              <time
                dateTime={card.createdAt}
                title={absoluteTime(card.createdAt)}
                className="text-zinc-500 dark:text-zinc-400"
              >
                {relativeTime(card.createdAt)}
              </time>
            </span>
          </Property>
        </>
      }
      onCommented={() => onCommented({ ...card, comments: card.comments + 1 })}
      restoreFocus={() =>
        document
          .querySelector<HTMLElement>(`[data-card-key="${CSS.escape(card.key)}"] a[data-card-link]`)
          ?.focus()
      }
      onClose={onClose}
    />
  )
}
