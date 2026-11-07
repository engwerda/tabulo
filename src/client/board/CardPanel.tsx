import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import DOMPurify from "dompurify"
import { type ReactNode, useEffect, useRef, useState } from "react"
import type { BoardCard, BoardColumn, CardDetail } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import {
  addComment,
  fetchCardDetail,
  fetchIssueOptions,
  setAssignee,
  setLabel,
  setMilestone,
} from "../api.ts"
import { absoluteTime, relativeTime } from "../format.ts"
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalIcon,
  IssueClosedIcon,
  LinkIcon,
  LockIcon,
  SearchIcon,
  UserMinusIcon,
  UserPlusIcon,
  XIcon,
} from "../ui/icons.tsx"
import { LabelChip, LabelList } from "../ui/LabelChip.tsx"
import { buttonClass, inputClass, Kbd, Popover } from "../ui/primitives.tsx"
import { useToast } from "../ui/toast.tsx"
import { ColumnDot, RepoTag } from "./BoardCardView.tsx"
import type { CardUpdate } from "./BoardPage.tsx"

/** Forgejo already sanitizes rendered Markdown; this keeps Tabulo safe if it ever does not. */
const sanitize = (html: string) => {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  const template = document.createElement("template")
  template.innerHTML = clean
  for (const link of template.content.querySelectorAll("a[href]")) {
    link.setAttribute("target", "_blank")
    link.setAttribute("rel", "noreferrer")
  }
  // The panel's own headings are h2 and h3, so a text's highest heading becomes h4.
  const headings = [...template.content.querySelectorAll("h1, h2, h3, h4, h5, h6")]
  const top = Math.min(...headings.map((heading) => Number(heading.tagName.slice(1))))
  for (const heading of headings) {
    const level = Math.min(6, Number(heading.tagName.slice(1)) - top + 4)
    const demoted = document.createElement(`h${level}`)
    demoted.append(...heading.childNodes)
    heading.replaceWith(demoted)
  }
  for (const box of template.content.querySelectorAll("input")) {
    box.setAttribute("disabled", "")
    box.setAttribute("aria-label", box.closest("li")?.textContent?.trim() || "Task")
  }
  return template.innerHTML
}

const Rendered = ({ html }: { html: string }) => (
  <div
    className="prose-forgejo"
    // biome-ignore lint/security/noDangerouslySetInnerHtml: Forgejo-rendered Markdown, sanitized again with DOMPurify
    dangerouslySetInnerHTML={{ __html: sanitize(html) }}
  />
)

const Property = ({ name, children }: { name: string; children: ReactNode }) => (
  <>
    <dt className="pt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{name}</dt>
    <dd className="min-w-0 text-sm text-zinc-800 dark:text-zinc-200">{children}</dd>
  </>
)

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform)

const sectionTitle =
  "text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"

const editTrigger =
  "inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-zinc-100 disabled:pointer-events-none dark:hover:bg-zinc-800/70"

const menuItem =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"

type Choice = { readonly value: string; readonly label: string; readonly icon?: ReactNode }

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
  trigger: ReactNode
  choices: ReadonlyArray<Choice> | undefined
  picked: ReadonlySet<string>
  multiple: boolean
  onPick: (value: string) => void
  disabled: boolean
}) => {
  const [search, setSearch] = useState("")
  const shown = (choices ?? []).filter((choice) =>
    choice.label.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <Popover
      label={trigger}
      accessibleLabel={`${name}: ${valueText}. Change`}
      triggerClass={editTrigger}
      containerClass="relative min-w-0"
      panelClass="w-64 p-1.5"
      onOpenChange={(open) => {
        if (!open) setSearch("")
      }}
    >
      {(close) => (
        <>
          <label className="relative mb-1 block">
            <span className="sr-only">Search {searchName}</span>
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${searchName}`}
              className={`${inputClass} pl-8 shadow-none`}
            />
          </label>
          <div role="menu" aria-label={name} className="scroll-thin max-h-72 overflow-y-auto">
            {choices === undefined && <p className="px-2 py-1.5 text-sm text-zinc-500">Loading…</p>}
            {shown.map((choice) => {
              const on = picked.has(choice.value)
              return (
                // biome-ignore lint/a11y/useAriaPropsSupportedByRole: both menu item roles take aria-checked
                <button
                  key={choice.value}
                  type="button"
                  role={multiple ? "menuitemcheckbox" : "menuitemradio"}
                  aria-checked={on}
                  aria-disabled={disabled}
                  onClick={() => {
                    // Disabling the button would drop its focus to the page while it saves.
                    if (disabled) return
                    onPick(choice.value)
                    if (!multiple) close()
                  }}
                  className={menuItem}
                >
                  {choice.icon}
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  {on && <CheckIcon className="size-4 text-indigo-600 dark:text-indigo-400" />}
                </button>
              )
            })}
            {choices !== undefined && shown.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-zinc-500">Nothing matches.</p>
            )}
          </div>
        </>
      )}
    </Popover>
  )
}

const CommentBox = ({ onSubmit }: { onSubmit: (body: string) => Promise<unknown> }) => {
  const [body, setBody] = useState("")
  const [pending, setPending] = useState(false)
  const submit = () => {
    const trimmed = body.trim()
    if (trimmed === "" || pending) return
    setPending(true)
    onSubmit(trimmed)
      .then(() => setBody(""))
      .catch(() => {})
      .finally(() => setPending(false))
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="rounded-xl border border-zinc-200 bg-white shadow-card transition focus-within:border-indigo-400 focus-within:ring-3 focus-within:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-indigo-500"
    >
      <label htmlFor="card-comment" className="sr-only">
        Add a comment
      </label>
      <textarea
        id="card-comment"
        value={body}
        rows={3}
        readOnly={pending}
        placeholder="Add a comment. Markdown works."
        onChange={(event) => {
          setBody(event.target.value)
          // The box grows as you type; keep its Comment button in view.
          event.currentTarget.form?.scrollIntoView({ block: "nearest" })
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submit()
          }
          if (event.key === "Escape") event.currentTarget.blur()
        }}
        className="block max-h-64 min-h-[4.5rem] w-full resize-none rounded-t-xl bg-transparent px-3 py-2.5 [field-sizing:content] text-base text-zinc-900 sm:text-sm placeholder:text-zinc-400 read-only:opacity-60 focus:outline-none dark:text-zinc-100"
      />
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
        <span className="mr-auto hidden items-center gap-1 pl-1 text-[0.6875rem] text-zinc-400 sm:flex [@media(hover:none)]:hidden">
          <Kbd>{IS_MAC ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>Enter</Kbd> to comment
        </span>
        <button
          type="submit"
          disabled={pending || body.trim() === ""}
          className={`${buttonClass.primary} h-7 px-2.5 text-xs`}
        >
          {pending ? "Commenting…" : "Comment"}
        </button>
      </div>
    </form>
  )
}

type CardPanelProps = {
  readonly org: string
  readonly card: BoardCard
  readonly columns: ReadonlyArray<BoardColumn>
  readonly viewer: string
  readonly movable: boolean
  /** Position among the shown cards of its column, for the previous and next buttons. */
  readonly position: { readonly index: number; readonly count: number }
  readonly onStep: (step: -1 | 1) => void
  readonly onMoveTo: (column: string) => void
  readonly onToggleAssigned: () => void
  /** Runs a change to the card's labels, milestone, or assignees and shows its result. */
  readonly onUpdate: (change: CardUpdate) => void
  /** The card with its new comment count after the viewer commented. */
  readonly onCommented: (card: BoardCard) => void
  /** Stops board reads in flight before a write, so their older answers cannot undo it. */
  readonly holdReads: () => Promise<void>
  readonly updating: boolean
  readonly onCopyLink: () => void
  readonly onClose: () => void
}

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
  holdReads,
  updating,
  onCopyLink,
  onClose,
}: CardPanelProps) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const detailKey = ["card-detail", org, card.repo, card.number] as const
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => fetchCardDetail(org, card.repo, card.number),
    staleTime: 30_000,
  })
  const editable = card.readOnlyReason === null
  const options = useQuery({
    queryKey: ["issue-options", org, card.repo],
    queryFn: () => fetchIssueOptions(org, card.repo),
    staleTime: 5 * 60_000,
    enabled: editable,
  })
  const comment = useMutation({
    mutationFn: (body: string) => addComment({ org, repo: card.repo, number: card.number, body }),
    onMutate: () => {
      if (!navigator.onLine) {
        toast({
          tone: "info",
          title: "You are offline",
          detail: "The comment is sent once you are back online.",
        })
      }
      return holdReads()
    },
    onSuccess: ({ comment: added }) => {
      queryClient.setQueryData<CardDetail>(detailKey, (current) =>
        current === undefined
          ? current
          : {
              ...current,
              comments: [...current.comments, added],
              commentCount: current.commentCount + 1,
            },
      )
      onCommented({ ...card, comments: card.comments + 1 })
    },
    onError: (error) =>
      toast({ tone: "error", title: "The comment was not added", detail: error.message }),
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const column = columns.find((candidate) => candidate.key === card.column)
  const assigned = card.assignees.some((assignee) => assignee.login === viewer)
  const closed = card.state === "closed"
  const ref = { org, repo: card.repo, number: card.number }
  const name = `${card.repo}#${card.number}`

  // Focus the heading when the panel opens or shows another card, so screen readers announce it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again for each card shown
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [card.key])

  // The card's own assignees stay choosable even when Forgejo no longer offers them.
  const assigneeChoices =
    options.data === undefined
      ? undefined
      : [
          ...new Map(
            [...card.assignees, ...options.data.assignees].map((person) => [person.login, person]),
          ).values(),
        ].map((person) => ({
          value: person.login,
          label: person.login === viewer ? `${person.login} (you)` : person.login,
          icon: <Avatar url={person.avatarUrl} name={person.login} size="xs" />,
        }))
  const labelChoices = options.data?.labels.map((label) => ({
    value: String(label.id),
    label: label.name,
    icon: (
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
    ),
  }))
  const milestoneChoices =
    options.data === undefined
      ? undefined
      : [
          { value: "", label: "No milestone" },
          ...options.data.milestones.map((milestone) => ({
            value: String(milestone.id),
            label: milestone.title,
          })),
        ]
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
    <>
      {/* On narrower screens the panel covers most of the board; a tap beside it closes it. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-30 animate-fade-in bg-zinc-950/20 lg:hidden"
      />
      <aside
        aria-label={`${card.repo}#${card.number} details`}
        className="fixed inset-y-0 right-0 z-40 flex w-full animate-slide-in flex-col border-l border-zinc-200 bg-white shadow-pop sm:w-[32rem] dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-zinc-100 px-3 dark:border-zinc-800/80">
          <span className="flex min-w-0 items-center gap-2 pl-1 text-sm text-zinc-500 dark:text-zinc-400">
            <RepoTag repo={card.repo} />
            <span className="font-medium tabular-nums">#{card.number}</span>
            {closed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                <IssueClosedIcon className="size-3.5" />
                Closed
              </span>
            )}
          </span>
          <span className="ml-auto flex items-center">
            <span className="mr-1 hidden text-xs text-zinc-400 tabular-nums sm:inline">
              {position.count > 0 &&
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
            <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
            <button
              type="button"
              onClick={onCopyLink}
              aria-label="Copy issue link"
              title="Copy issue link"
              className={buttonClass.icon}
            >
              <LinkIcon />
            </button>
            <a
              href={card.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in Forgejo"
              title="Open in Forgejo (O)"
              className={buttonClass.icon}
            >
              <ExternalIcon />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              title="Close (Esc)"
              className={buttonClass.icon}
            >
              <XIcon />
            </button>
          </span>
        </div>
        <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-8">
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-xl leading-7 font-semibold tracking-tight text-balance break-words text-zinc-900 focus:outline-none dark:text-zinc-50"
            >
              {card.title}
            </h2>

            <dl className="mt-6 grid grid-cols-[6.5rem_1fr] items-start gap-x-3 gap-y-2.5">
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
                          <button
                            key={option.key}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option.key === card.column}
                            onClick={() => {
                              close()
                              onMoveTo(option.key)
                            }}
                            className={menuItem}
                          >
                            <ColumnDot column={option} />
                            <span className="flex-1 truncate">{option.title}</span>
                            {option.key === card.column && (
                              <CheckIcon className="size-4 text-indigo-600 dark:text-indigo-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </Popover>
                ) : (
                  <span className="inline-flex items-center gap-2 px-1.5 py-1 font-medium">
                    {column !== undefined && <ColumnDot column={column} />}
                    {column?.title ?? card.column}
                    {card.readOnlyReason === "archived" && (
                      <span className="flex items-center gap-1 text-xs font-normal text-zinc-500">
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
                      valueText={
                        card.assignees.map((person) => person.login).join(", ") || "nobody"
                      }
                      searchName="people"
                      multiple
                      disabled={updating}
                      choices={assigneeChoices}
                      picked={new Set(card.assignees.map((person) => person.login))}
                      onPick={(login) => {
                        const on = card.assignees.some((person) => person.login === login)
                        const set = (to: boolean) => () =>
                          setAssignee({ ...ref, login, assigned: to })
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
                        card.assignees.length === 0 ? (
                          <span className="text-zinc-500 dark:text-zinc-400">Nobody</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {card.assignees.map((person) => (
                              <span key={person.login} className="flex items-center gap-1.5">
                                <Avatar url={person.avatarUrl} name={person.login} size="xs" />
                                {person.login}
                              </span>
                            ))}
                          </span>
                        )
                      }
                    />
                  ) : (
                    <span className="px-1.5 py-1 text-zinc-500">
                      {card.assignees.map((person) => person.login).join(", ") || "Nobody"}
                    </span>
                  )}
                  {editable && !closed && (
                    <button
                      type="button"
                      onClick={onToggleAssigned}
                      disabled={updating}
                      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
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
                        options.data?.labels.find((label) => String(label.id) === id)?.name ??
                        "label"
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
                      card.labels.length === 0 ? (
                        <span className="text-zinc-500 dark:text-zinc-400">None</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {card.labels.map((label) => (
                            <LabelChip
                              key={label.id}
                              name={label.name}
                              color={label.color}
                              size="md"
                            />
                          ))}
                        </span>
                      )
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
                      const back =
                        card.milestone === null ? null : (currentMilestone?.id ?? undefined)
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
                    trigger={
                      card.milestone ?? (
                        <span className="text-zinc-500 dark:text-zinc-400">None</span>
                      )
                    }
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
            </dl>

            <section aria-labelledby="card-description" className="mt-8">
              <h3 id="card-description" className={sectionTitle}>
                Description
              </h3>
              <div className="mt-3">
                {detail.data !== undefined ? (
                  detail.data.bodyHtml.trim() === "" ? (
                    <p className="text-sm text-zinc-500 italic dark:text-zinc-400">
                      No description provided.
                    </p>
                  ) : (
                    <Rendered html={detail.data.bodyHtml} />
                  )
                ) : detail.isError ? (
                  <div role="alert" className="text-sm text-red-700 dark:text-red-400">
                    Could not load the description: {detail.error.message}{" "}
                    <button
                      type="button"
                      onClick={() => void detail.refetch()}
                      className="font-medium underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2" aria-hidden="true">
                    {["w-11/12", "w-full", "w-3/4", "w-5/6"].map((width) => (
                      <div
                        key={width}
                        className={`h-3.5 animate-shimmer rounded bg-zinc-200 dark:bg-zinc-800 ${width}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section aria-labelledby="card-comments" className="mt-8">
              <h3 id="card-comments" className={`${sectionTitle} flex items-center gap-2`}>
                Comments
                {detail.data !== undefined && (
                  <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[0.6875rem] tabular-nums dark:bg-zinc-800">
                    {detail.data.commentCount}
                  </span>
                )}
              </h3>
              {detail.data !== undefined &&
                detail.data.commentCount > detail.data.comments.length && (
                  <a
                    href={card.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    {detail.data.commentCount - detail.data.comments.length} earlier comments in
                    Forgejo
                    <ExternalIcon className="size-3.5" />
                  </a>
                )}
              <ol className="mt-3 space-y-4">
                {(detail.data?.comments ?? []).map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <Avatar url={item.author.avatarUrl} name={item.author.login} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2 text-xs">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {item.author.login}
                        </span>
                        <time
                          dateTime={item.createdAt}
                          title={absoluteTime(item.createdAt)}
                          className="text-zinc-500 dark:text-zinc-400"
                        >
                          {relativeTime(item.createdAt)}
                        </time>
                      </p>
                      <div className="mt-1 rounded-xl rounded-tl-sm bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                        {item.bodyHtml.trim() === "" ? (
                          <p className="text-sm text-zinc-500 italic">No text.</p>
                        ) : (
                          <Rendered html={item.bodyHtml} />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {detail.data !== undefined && detail.data.comments.length === 0 && (
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No comments yet.</p>
              )}
              {editable && (
                <div className="mt-4">
                  <CommentBox onSubmit={(body) => comment.mutateAsync(body)} />
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-zinc-100 px-6 py-3 dark:border-zinc-800/80">
          <a href={card.url} target="_blank" rel="noreferrer" className={buttonClass.secondary}>
            <ExternalIcon className="size-4 text-zinc-400" />
            Open in Forgejo
          </a>
          <span className="ml-auto hidden items-center gap-1 text-xs text-zinc-400 sm:flex [@media(hover:none)]:hidden">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> to browse
          </span>
        </div>
      </aside>
    </>
  )
}
