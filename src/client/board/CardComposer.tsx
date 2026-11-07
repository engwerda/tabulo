import { useEffect, useId, useRef, useState } from "react"
import { RepoIcon } from "../ui/icons.tsx"
import { buttonClass } from "../ui/primitives.tsx"

type CardComposerProps = {
  readonly columnTitle: string
  /** Repositories a new issue can go to: the board's, without archived ones. */
  readonly repos: ReadonlyArray<string>
  readonly repo: string
  readonly onRepoChange: (repo: string) => void
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
  onCreate,
  onClose,
}: CardComposerProps) => {
  const [title, setTitle] = useState("")
  const [pending, setPending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const repoId = useId()

  useEffect(() => input.current?.focus(), [])

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
      className="animate-pop-in rounded-xl border border-indigo-300 bg-white p-2.5 shadow-card ring-3 ring-indigo-500/10 dark:border-indigo-500/60 dark:bg-zinc-900"
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
        className="block w-full resize-none bg-transparent text-[0.8125rem] leading-5 font-medium text-zinc-900 placeholder:font-normal placeholder:text-zinc-400 focus:outline-none read-only:opacity-60 dark:text-zinc-100"
      />
      <div className="mt-2 flex items-center gap-2">
        {repos.length > 1 ? (
          <label className="flex min-w-0 items-center gap-1 rounded-md bg-zinc-100 py-0.5 pr-1 pl-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <RepoIcon className="size-3.5 text-zinc-400" />
            <span className="sr-only">Repository</span>
            <select
              value={repo}
              onChange={(event) => onRepoChange(event.target.value)}
              disabled={pending}
              className="min-w-0 max-w-32 truncate bg-transparent font-medium focus:outline-none"
            >
              {repos.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
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
          className={`${buttonClass.ghost} ml-auto h-7 px-2 text-xs`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || title.trim() === ""}
          className={`${buttonClass.primary} h-7 px-2.5 text-xs`}
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  )
}
