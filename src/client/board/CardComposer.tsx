import { useEffect, useId, useRef, useState } from "react"
import { ChevronDownIcon, RepoIcon } from "../ui/icons.tsx"
import { buttonClass } from "../ui/primitives.tsx"

type CardComposerProps = {
  readonly columnTitle: string
  /** Repositories a new issue can go to: the board's, without archived ones. */
  readonly repos: ReadonlyArray<string>
  readonly repo: string
  readonly onRepoChange: (repo: string) => void
  /** The title typed before the composer last closed in this column. */
  readonly draft: string
  readonly onDraftChange: (title: string) => void
  /** Resolves once the issue exists; the composer then clears for the next one. */
  readonly onCreate: (repo: string, title: string) => Promise<void>
  readonly onClose: () => void
}

/** An inline form at the top of a column that creates issues one after another. */
export const CardComposer = ({
  columnTitle,
  repos,
  repo,
  onRepoChange,
  draft,
  onDraftChange,
  onCreate,
  onClose,
}: CardComposerProps) => {
  const [title, setTitleState] = useState(draft)
  const setTitle = (next: string) => {
    setTitleState(next)
    onDraftChange(next)
  }
  const [pending, setPending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const repoId = useId()

  useEffect(() => {
    const element = input.current
    element?.focus()
    // A restored draft is picked up where it was left: the caret goes to its end.
    element?.setSelectionRange(element.value.length, element.value.length)
  }, [])

  const submit = () => {
    const trimmed = title.trim()
    if (trimmed === "" || pending) return
    setPending(true)
    onCreate(repo, trimmed)
      .then(() => setTitle(""))
      .catch(() => {})
      .finally(() => {
        setPending(false)
        input.current?.focus()
      })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
        }
      }}
      className="animate-pop-in rounded-xl border border-indigo-300 bg-white p-2.5 shadow-card ring-3 ring-indigo-500/10 dark:border-indigo-500/50 dark:bg-zinc-900"
    >
      <label className="sr-only" htmlFor={`${repoId}-title`}>
        Title of the new issue in {columnTitle}
      </label>
      <textarea
        id={`${repoId}-title`}
        ref={input}
        value={title}
        rows={2}
        maxLength={255}
        readOnly={pending}
        placeholder="Issue title"
        onChange={(event) => setTitle(event.target.value.replace(/\n/g, " "))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
        className="block w-full resize-none bg-transparent text-base sm:text-sm leading-5 font-medium text-zinc-900 placeholder:font-normal placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none read-only:opacity-60 dark:text-zinc-100"
      />
      <div className="mt-2 flex items-center gap-2">
        {repos.length > 1 ? (
          // The select fills the chip, so a tap anywhere on it opens the list.
          <label className="relative flex min-w-0 items-center rounded-md bg-zinc-100 text-xs text-zinc-600 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-indigo-500 dark:bg-zinc-800 dark:text-zinc-300">
            <RepoIcon className="pointer-events-none absolute left-1.5 size-3.5 text-zinc-500 pointer-coarse:left-2.5 dark:text-zinc-400" />
            <span className="sr-only">Repository</span>
            <select
              value={repo}
              onChange={(event) => onRepoChange(event.target.value)}
              disabled={pending}
              className="h-6 max-w-40 min-w-0 cursor-pointer appearance-none truncate rounded-md bg-transparent pr-5 pl-6 font-medium [field-sizing:content] focus:outline-none pointer-coarse:h-11 pointer-coarse:pr-7 pointer-coarse:pl-8"
            >
              {repos.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-1 size-3 opacity-60 pointer-coarse:right-2.5" />
          </label>
        ) : (
          <span className="flex min-w-0 items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <RepoIcon className="size-3.5" />
            <span className="truncate">{repo}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`${buttonClass.ghost} ml-auto h-7 px-2 text-xs pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-sm`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || title.trim() === ""}
          className={`${buttonClass.primary} h-7 px-2.5 text-xs pointer-coarse:h-11 pointer-coarse:px-4 pointer-coarse:text-sm`}
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  )
}
