import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import DOMPurify from "dompurify"
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { BoardCard, BoardColumn, CardDetail, IssueOptions } from "../../shared/api.ts"
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
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import {
  ChevronDownIcon,
  ExternalIcon,
  IssueClosedIcon,
  LinkIcon,
  LockIcon,
  UserMinusIcon,
  UserPlusIcon,
  XIcon,
} from "../ui/icons.tsx"
import { LabelChip, LabelList } from "../ui/LabelChip.tsx"
import { buttonClass, Kbd, MenuOption, Popover } from "../ui/primitives.tsx"
import { SearchField } from "../ui/SearchField.tsx"
import { useToast } from "../ui/toast.tsx"
import { ColumnDot, LabelName, RepoIssueRef } from "./BoardCardView.tsx"
import type { CardUpdate } from "./BoardPage.tsx"
import { boardWriteKey } from "./board-view.ts"
import { commentDraftKey, drafts } from "./drafts.ts"

const FORM_TAGS = ["button", "dialog", "form", "option", "select", "textarea"]
const FORM_ATTRIBUTES = ["action", "formaction", "popover", "popovertarget"]

/** Forgejo already sanitizes rendered Markdown; this keeps Tabulo safe if it ever does not. */
const sanitize = (html: string) => {
  const content = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [...FORM_TAGS, "style"],
    FORBID_ATTR: [...FORM_ATTRIBUTES, "style"],
    RETURN_DOM_FRAGMENT: true,
  })
  for (const link of content.querySelectorAll("a[href]")) {
    if (link.getAttribute("href")?.startsWith("#")) continue
    link.setAttribute("target", "_blank")
    link.setAttribute("rel", "noreferrer")
    const hint = document.createElement("span")
    hint.className = "sr-only"
    hint.textContent = " (opens in a new tab)"
    link.append(hint)
  }
  // The panel's own headings are h2 and h3, so a text's highest heading becomes h4.
  const headings = [...content.querySelectorAll("h1, h2, h3, h4, h5, h6")]
  const top = Math.min(...headings.map((heading) => Number(heading.tagName.slice(1))))
  for (const heading of headings) {
    const level = Math.min(6, Number(heading.tagName.slice(1)) - top + 4)
    const demoted = document.createElement(`h${level}`)
    for (const { name, value } of heading.attributes) demoted.setAttribute(name, value)
    demoted.append(...heading.childNodes)
    heading.replaceWith(demoted)
  }
  for (const input of content.querySelectorAll("input")) {
    if (input.type !== "checkbox") {
      input.remove()
      continue
    }
    input.setAttribute("disabled", "")
    input.setAttribute("aria-label", input.closest("li")?.textContent?.trim() || "Task")
  }
  const container = document.createElement("div")
  container.append(content)
  return container.innerHTML
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
    <dt className="pt-1.5 text-xs font-medium text-zinc-500 pointer-coarse:pt-3.5 dark:text-zinc-400">
      {name}
    </dt>
    <dd className="min-w-0 text-sm text-zinc-800 pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center dark:text-zinc-200">
      {children}
    </dd>
  </>
)

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform)

// From the lg breakpoint the panel sits beside the board; below it, it covers the board as a modal.
const wideQuery = window.matchMedia("(min-width: 64rem)")
const subscribeWide = (changed: () => void) => {
  wideQuery.addEventListener("change", changed)
  return () => wideQuery.removeEventListener("change", changed)
}

/** Toasts stay usable over a modal panel: their Undo and Retry act on the open card. */
const STAYS_LIVE = 'section[aria-label="Notifications"]'

/**
 * While `modal`, everything outside `layer` is inert, so focus and assistive technology stay in
 * the panel. Popovers the panel opens render into the body later and stay live.
 */
const useInertOutside = (
  modal: boolean,
  layer: { readonly current: HTMLElement | null },
  restoreFocus: () => void,
) => {
  const restore = useRef(restoreFocus)
  restore.current = restoreFocus
  useEffect(() => {
    if (!modal) return
    const made: HTMLElement[] = []
    for (
      let node = layer.current;
      node !== null && node !== document.body;
      node = node.parentElement
    ) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (
          sibling !== node &&
          sibling instanceof HTMLElement &&
          !sibling.inert &&
          !sibling.matches(STAYS_LIVE)
        ) {
          sibling.inert = true
          made.push(sibling)
        }
      }
    }
    return () => {
      for (const element of made) element.inert = false
      // Closing tried to focus the card while the board was still inert; it can take focus now.
      if (document.activeElement === null || document.activeElement === document.body) {
        restore.current()
      }
    }
  }, [modal, layer])
}

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Tab and Shift+Tab wrap around inside a modal panel. The rest of the page is inert, so without
 * this Tab past the last control leaves for the browser's own controls. Beside the board only Tab
 * wraps: the panel comes last on the page, and its header's controls sit above the heading that
 * takes focus, so Tab past the last control goes back to them while Shift+Tab still reaches the
 * board. Keys from a picker's panel bubble here through the portal; the picker handles its own Tab.
 */
const loopFocus = (event: KeyboardEvent<HTMLElement>, modal: boolean) => {
  if (event.key !== "Tab" || event.defaultPrevented || (event.shiftKey && !modal)) return
  const dialog = event.currentTarget
  if (!(event.target instanceof Node) || !dialog.contains(event.target)) return
  const stops = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0,
  )
  const first = stops[0]
  const last = stops.at(-1)
  if (first === undefined || last === undefined) return
  const active = document.activeElement
  if (event.shiftKey ? active === first || active === dialog : active === last) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}

const sectionTitle =
  "text-2xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"

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

const CommentBox = ({
  draftKey,
  ready,
  onSubmit,
}: {
  /** Where the unsent text is kept, so closing the panel or stepping to another card keeps it. */
  draftKey: string
  /** False until the comments have loaded, so a new one cannot land before the ones it follows. */
  ready: boolean
  onSubmit: (body: string) => Promise<unknown>
}) => {
  const [body, setBodyState] = useState(() => drafts.read(draftKey))
  const setBody = (next: string) => {
    setBodyState(next)
    drafts.write(draftKey, next)
  }
  const [pending, setPending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const submit = () => {
    const trimmed = body.trim()
    if (trimmed === "" || pending || !ready) return
    setPending(true)
    onSubmit(trimmed)
      .then(() => setBody(""))
      .catch(() => {})
      .finally(() => setPending(false))
  }
  return (
    // The form takes focus from the box on Escape: the reader keeps their place in the thread,
    // the box keeps its focus border, and a second Escape closes the panel.
    <form
      ref={form}
      tabIndex={-1}
      aria-label="New comment"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="rounded-xl border border-zinc-200 bg-white shadow-card transition outline-none focus-within:border-indigo-400 focus-within:ring-3 focus-within:ring-indigo-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-indigo-500"
    >
      <label htmlFor="card-comment" className="sr-only">
        Add a comment
      </label>
      <textarea
        id="card-comment"
        ref={input}
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
          if (event.key === "Escape") form.current?.focus({ preventScroll: true })
        }}
        className="block max-h-64 min-h-[4.5rem] w-full resize-none rounded-t-xl bg-transparent px-3 py-2.5 [field-sizing:content] text-base text-zinc-900 sm:text-sm placeholder:text-zinc-500 dark:placeholder:text-zinc-400 read-only:opacity-60 focus:outline-none dark:text-zinc-100"
      />
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
        <span className="mr-auto hidden items-center gap-1 pl-1 text-2xs text-zinc-500 sm:flex pointer-coarse:hidden dark:text-zinc-400">
          <Kbd>{IS_MAC ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>Enter</Kbd> to comment
        </span>
        {body !== "" && !pending && (
          <button
            type="button"
            onClick={() => {
              setBody("")
              input.current?.focus()
            }}
            className={`${buttonClass.ghost} h-7 px-2 text-xs pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-sm`}
          >
            Discard
          </button>
        )}
        <button
          type="submit"
          disabled={pending || !ready || body.trim() === ""}
          className={`${buttonClass.primary} h-7 px-2.5 text-xs pointer-coarse:h-11 pointer-coarse:px-4 pointer-coarse:text-sm`}
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
    mutationKey: [...boardWriteKey(org), "comment"],
    mutationFn: (body: string) => addComment({ org, repo: card.repo, number: card.number, body }),
    onMutate: () => {
      if (!navigator.onLine) {
        toast({
          tone: "info",
          title: "You are offline",
          detail: "The comment is sent once you are back online.",
        })
      }
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
      toast({ tone: "error", title: "Could not add the comment", detail: error.message }),
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const modal = !useSyncExternalStore(subscribeWide, () => wideQuery.matches)
  useInertOutside(modal, layer, () =>
    document
      .querySelector<HTMLElement>(`[data-card-key="${CSS.escape(card.key)}"] a[data-card-link]`)
      ?.focus(),
  )
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
    <div ref={layer} data-card-panel="">
      {/* Below lg the panel is a modal over the board; a tap beside it closes it. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-30 animate-fade-in bg-zinc-950/30 lg:hidden"
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the role, set below, is dialog or complementary */}
      <div
        {...{
          role: modal ? "dialog" : "complementary",
          "aria-modal": modal || undefined,
          "aria-label": `${name} details`,
        }}
        onKeyDown={(event) => loopFocus(event, modal)}
        className="fixed inset-y-0 right-0 z-40 flex w-full animate-slide-in flex-col border-zinc-200 bg-white shadow-pop sm:w-[32rem] lg:border-l lg:absolute lg:rounded-tl-xl lg:border-t dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-zinc-200/70 pr-2 pl-4 dark:border-zinc-800">
          <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="min-w-0 font-medium">
              <RepoIssueRef repo={card.repo} number={card.number} />
            </span>
            {closed && (
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <IssueClosedIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Closed
              </span>
            )}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
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
        <div ref={scroller} data-scroll="" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-8">
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-xl leading-7 font-semibold tracking-tight text-balance break-words text-zinc-900 focus:outline-none dark:text-zinc-50"
            >
              {card.title}
            </h2>

            <dl className="mt-6 grid grid-cols-[6.5rem_1fr] items-start gap-x-3 gap-y-2.5 pointer-coarse:gap-y-1">
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
                      valueText={
                        card.assignees.map((person) => person.login).join(", ") || "nobody"
                      }
                      searchName="assignees"
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
                      card.labels.length === 0
                        ? [
                            <span key="none" className="text-zinc-500 dark:text-zinc-400">
                              None
                            </span>,
                          ]
                        : card.labels.map((label) => (
                            <LabelChip
                              key={label.id}
                              name={label.name}
                              color={label.color}
                              size="md"
                            />
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
            </dl>

            {detail.data === undefined && detail.isError ? (
              <ErrorNotice
                bare
                title="Could not load the description and comments"
                onRetry={() => void detail.refetch()}
                retrying={detail.isFetching}
                className="mt-8"
              >
                {detail.error.message}
              </ErrorNotice>
            ) : (
              <>
                {detail.isError && (
                  <ErrorNotice
                    bare
                    tone="warning"
                    title="Could not refresh the description and comments"
                    onRetry={() => void detail.refetch()}
                    retrying={detail.isFetching}
                    className="mt-8"
                  >
                    {`These were loaded ${relativeTime(new Date(detail.dataUpdatedAt).toISOString())}, so newer comments may be missing. ${detail.error.message}`}
                  </ErrorNotice>
                )}
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
                    ) : (
                      <div role="status" className="space-y-2">
                        <span className="sr-only">Loading the description and comments</span>
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
                  <h3
                    id="card-comments"
                    className={`${sectionTitle} flex w-fit items-center gap-2`}
                  >
                    Comments
                    {detail.data !== undefined && (
                      <span className="font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
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
                              <p className="text-sm text-zinc-500 italic dark:text-zinc-400">
                                No text.
                              </p>
                            ) : (
                              <Rendered html={item.bodyHtml} />
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {detail.data !== undefined && detail.data.comments.length === 0 && (
                    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                      No comments yet.
                    </p>
                  )}
                  {editable && (
                    <div className="mt-4">
                      <CommentBox
                        key={card.key}
                        draftKey={commentDraftKey(card.key)}
                        ready={detail.data !== undefined}
                        onSubmit={(body) => comment.mutateAsync(body)}
                      />
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
