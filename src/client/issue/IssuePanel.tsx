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
import type { CardDetail, CardPullRequest } from "../../shared/api.ts"
import { Avatar } from "../Avatar.tsx"
import { addComment, fetchCardDetail, fetchCardPullRequests } from "../api.ts"
import { boardWriteKey } from "../board/board-view.ts"
import { commentDraftKey, drafts } from "../board/drafts.ts"
import { absoluteTime, relativeTime } from "../format.ts"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import { IssueRef } from "../ui/IssueRef.tsx"
import { ExternalIcon, IssueClosedIcon, LinkIcon, XIcon } from "../ui/icons.tsx"
import { buttonClass, Kbd } from "../ui/primitives.tsx"
import { useToast } from "../ui/toast.tsx"
import type { PanelIssue } from "./panel-issue.ts"

/** The board and the dashboard read the same issue under the same key; Forgejo ignores case. */
const issueQueryKey = (what: "issue-detail" | "issue-pulls", issue: PanelIssue) =>
  [what, issue.owner.toLowerCase(), issue.repo.toLowerCase(), issue.number] as const

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

/** One row of the panel's property list. */
export const Property = ({ name, children }: { name: string; children: ReactNode }) => (
  <>
    <dt className="pt-1.5 text-xs font-medium text-zinc-500 pointer-coarse:pt-3.5 dark:text-zinc-400">
      {name}
    </dt>
    <dd className="min-w-0 text-sm text-zinc-800 pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center dark:text-zinc-200">
      {children}
    </dd>
  </>
)

/** Copies the address of an issue or pull request in Forgejo and says how that went. */
export const copyIssueLink = (
  toast: ReturnType<typeof useToast>,
  url: string,
  kind: PanelIssue["kind"],
) => {
  navigator.clipboard.writeText(url).then(
    () =>
      toast({
        tone: "info",
        title: kind === "pull" ? "Pull request link copied" : "Issue link copied",
        detail: url,
      }),
    () => toast({ tone: "error", title: "Could not copy the link", detail: url }),
  )
}

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform)

// From the lg breakpoint the board's panel sits beside the board; below it, it covers the board
// as a modal.
const wideQuery = window.matchMedia("(min-width: 64rem)")
const subscribeWide = (changed: () => void) => {
  wideQuery.addEventListener("change", changed)
  return () => wideQuery.removeEventListener("change", changed)
}

/**
 * Toasts stay usable over a modal panel, since their Undo and Retry act on the open issue, and so
 * do dialogs opened over it, such as the shortcut list.
 */
const STAYS_LIVE = 'section[aria-label="Notifications"], dialog'

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
      // Closing tried to focus the opener while the page was still inert; it can take focus now.
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

const forgejoLink =
  "flex w-fit items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"

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

const PULL_STATES: Record<
  CardPullRequest["state"],
  { readonly word: string; readonly tint: string }
> = {
  open: {
    word: "Open",
    tint: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-400/20",
  },
  draft: {
    word: "Draft",
    tint: "bg-zinc-50 text-zinc-600 ring-zinc-900/10 dark:bg-zinc-800/60 dark:text-zinc-300 dark:ring-white/10",
  },
  merged: {
    word: "Merged",
    tint: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-400/20",
  },
  closed: {
    word: "Closed",
    tint: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-400/20",
  },
}

/** `#12` in the issue's repository, `repo#12` elsewhere under its owner, or `owner/repo#12`. */
const pullRepo = (issue: PanelIssue, repo: string) => {
  const name = repo.toLowerCase()
  if (name === `${issue.owner}/${issue.repo}`.toLowerCase()) return ""
  return name.startsWith(`${issue.owner.toLowerCase()}/`)
    ? repo.slice(issue.owner.length + 1)
    : repo
}

/**
 * The pull requests that reference the issue: only when there is one, when the read failed, or
 * when Forgejo may list more. Nothing shows while loading, so an issue without pull requests
 * never flashes an empty section.
 */
const PullRequestList = ({ issue }: { issue: PanelIssue }) => {
  const pulls = useQuery({
    queryKey: issueQueryKey("issue-pulls", issue),
    queryFn: () => fetchCardPullRequests(issue.owner, issue.repo, issue.number),
    staleTime: 30_000,
  })
  const data = pulls.data
  if (data === undefined && !pulls.isError) return null
  if (data !== undefined && data.pullRequests.length === 0 && data.complete) return null
  return (
    <section aria-labelledby="card-pulls" className="mt-8">
      <h3 id="card-pulls" className={`${sectionTitle} flex w-fit items-center gap-2`}>
        Pull requests
        {data !== undefined && data.pullRequests.length > 0 && (
          <span className="font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
            {data.pullRequests.length}
          </span>
        )}
      </h3>
      {data === undefined ? (
        <ErrorNotice
          bare
          tone="warning"
          title="Could not load the pull requests"
          onRetry={() => void pulls.refetch()}
          retrying={pulls.isFetching}
          className="mt-3"
        />
      ) : (
        <>
          <ul className="mt-2 space-y-0.5">
            {data.pullRequests.map((pull) => (
              <li key={pull.key}>
                <a
                  href={pull.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group -mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-zinc-100 pointer-coarse:min-h-11 dark:hover:bg-zinc-800/70"
                >
                  <span
                    className={`inline-flex h-5 w-14 shrink-0 items-center justify-center rounded-md text-2xs font-medium ring-1 ring-inset ${PULL_STATES[pull.state].tint}`}
                  >
                    {PULL_STATES[pull.state].word}
                  </span>
                  <IssueRef
                    repo={pullRepo(issue, pull.repo)}
                    number={pull.number}
                    className="max-w-1/2 text-xs text-zinc-500 dark:text-zinc-400"
                  />
                  <span
                    title={pull.title}
                    className="min-w-0 flex-1 truncate text-sm text-zinc-800 group-hover:text-indigo-700 dark:text-zinc-200 dark:group-hover:text-indigo-300"
                  >
                    {pull.title}
                  </span>
                  {pull.reference === "closes" && (
                    <span
                      title="Merging it into the default branch closes this issue"
                      className="inline-flex h-5 shrink-0 items-center rounded-md border border-zinc-200 px-1.5 text-2xs font-medium text-zinc-600 dark:border-zinc-700/80 dark:text-zinc-300"
                    >
                      Closes<span className="sr-only"> this issue</span>
                    </span>
                  )}
                  <span className="sr-only"> (opens in Forgejo)</span>
                </a>
              </li>
            ))}
          </ul>
          {!data.complete && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              This issue's history is too long to read in full.{" "}
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline dark:text-indigo-300"
              >
                Forgejo may list more
                <ExternalIcon className="size-3.5" />
              </a>
            </p>
          )}
        </>
      )}
    </section>
  )
}

type IssuePanelProps = {
  readonly issue: PanelIssue
  /** The reference in words, which names the panel: `repo#12` on a board, else `owner/repo#12`. */
  readonly name: string
  /** The reference in the header, such as the board's `RepoIssueRef`. */
  readonly reference: ReactNode
  /**
   * "beside": the board's panel, complementary beside the board from lg up and modal below.
   * "over": modal at every width, with its backdrop always shown.
   */
  readonly placement: "beside" | "over"
  /** Whether the panel offers a comment box. */
  readonly canComment: boolean
  /** Controls before the copy, open, and close buttons, such as the board's previous and next. */
  readonly headerControls?: ReactNode
  /** The rows of the property list, built from `Property`. */
  readonly properties: ReactNode
  /** Runs after a comment is added and shown in the panel. */
  readonly onCommented: () => void
  /** Where focus goes when the panel closes while focus is inside it. */
  readonly restoreFocus: () => void
  readonly onClose: () => void
}

/**
 * An issue or pull request with its description and latest comments, as the board's card panel
 * and the dashboard's preview show it.
 */
export const IssuePanel = ({
  issue,
  name,
  reference,
  placement,
  canComment,
  headerControls,
  properties,
  onCommented,
  restoreFocus,
  onClose,
}: IssuePanelProps) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const detailKey = issueQueryKey("issue-detail", issue)
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => fetchCardDetail(issue.owner, issue.repo, issue.number),
    staleTime: 30_000,
  })
  // A comment changes the comment count that boards show, so it is a board write.
  const comment = useMutation({
    mutationKey: [...boardWriteKey(issue.owner), "comment"],
    mutationFn: (body: string) =>
      addComment({ org: issue.owner, repo: issue.repo, number: issue.number, body }),
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
      onCommented()
    },
    onError: (error) =>
      toast({ tone: "error", title: "Could not add the comment", detail: error.message }),
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const wide = useSyncExternalStore(subscribeWide, () => wideQuery.matches)
  const beside = placement === "beside"
  const modal = !beside || !wide
  useInertOutside(modal, layer, restoreFocus)

  // Focus the heading when the panel opens or shows another issue, so screen readers announce it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again for each issue shown
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [issue.key])

  return (
    <div ref={layer} data-card-panel="">
      {/*
        A modal panel covers the page; a tap beside it closes it. The press keeps focus in the
        panel, or the page's focusable container would take it and closing could not return it.
      */}
      <div
        aria-hidden="true"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClose}
        className={
          beside
            ? "fixed inset-0 z-30 animate-fade-in bg-zinc-950/30 lg:hidden"
            : "fixed inset-0 z-30 animate-fade-in bg-zinc-950/30"
        }
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the role, set below, is dialog or complementary */}
      <div
        {...{
          role: modal ? "dialog" : "complementary",
          "aria-modal": modal || undefined,
          "aria-label": `${name} details`,
        }}
        onKeyDown={(event) => loopFocus(event, modal)}
        className={`fixed inset-y-0 right-0 z-40 flex w-full animate-slide-in flex-col border-zinc-200 bg-white shadow-pop sm:w-[32rem] ${
          beside ? "lg:border-l lg:absolute lg:rounded-tl-xl lg:border-t" : "sm:border-l"
        } dark:border-zinc-800 dark:bg-zinc-950`}
      >
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-zinc-200/70 pr-2 pl-4 dark:border-zinc-800">
          <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="min-w-0 font-medium">{reference}</span>
            {issue.closed && (
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <IssueClosedIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Closed
              </span>
            )}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
            {headerControls}
            <button
              type="button"
              onClick={() => copyIssueLink(toast, issue.url, issue.kind)}
              aria-label={issue.kind === "pull" ? "Copy pull request link" : "Copy issue link"}
              title={issue.kind === "pull" ? "Copy pull request link" : "Copy issue link"}
              className={buttonClass.icon}
            >
              <LinkIcon />
            </button>
            <a
              href={issue.url}
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
        <div data-scroll="" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-8">
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-xl leading-7 font-semibold tracking-tight text-balance break-words text-zinc-900 focus:outline-none dark:text-zinc-50"
            >
              {issue.title}
            </h2>

            <dl className="mt-6 grid grid-cols-[6.5rem_1fr] items-start gap-x-3 gap-y-2.5 pointer-coarse:gap-y-1">
              {properties}
            </dl>

            {issue.kind === "pull" ? (
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                className={`mt-6 ${forgejoLink}`}
              >
                Files, review comments, and checks
                <ExternalIcon className="size-3.5" />
                <span className="sr-only"> (opens in Forgejo)</span>
              </a>
            ) : (
              <PullRequestList issue={issue} />
            )}

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
                        href={issue.url}
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
                  {canComment && (
                    <div className="mt-4">
                      <CommentBox
                        key={issue.key}
                        draftKey={commentDraftKey(issue.key)}
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
