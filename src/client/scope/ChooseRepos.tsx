import { useQuery } from "@tanstack/react-query"
import { useId } from "react"
import { fetchOrgRepos } from "../api.ts"
import { Glyph } from "../palette/icons.tsx"
import { ErrorNotice } from "../ui/ErrorNotice.tsx"
import { buttonClass, cardClass } from "../ui/primitives.tsx"
import { MAX_REPOS } from "./first-visit.ts"
import type { RepoSelection } from "./use-repo-selection.ts"
import { type OrgViewId, orgView } from "./views.ts"

/**
 * What an org-level view shows when no repositories are chosen: the view's glyph, why it needs
 * repositories, and a way to choose every active one when the server allows that many. When the
 * organization's repositories cannot load, it shows that failure with a retry instead.
 */
export const ChooseRepos = ({
  org,
  view,
  repoSelection,
  children,
}: {
  readonly org: string
  readonly view: OrgViewId
  readonly repoSelection: RepoSelection
  /** One sentence: what the view shows once repositories are chosen. */
  readonly children: string
}) => {
  const repos = useQuery({
    queryKey: ["org-repos", org],
    queryFn: () => fetchOrgRepos(org),
    // A refetch on mount would put a failed query back to loading, which shows the view's
    // skeleton and unmounts this notice, which then mounts again when it fails: a loop.
    retryOnMount: false,
  })
  const headingId = useId()
  if (repos.isError) {
    return (
      <ErrorNotice
        title={`Could not load the repositories of ${org}`}
        onRetry={() => void repos.refetch()}
        retrying={repos.isFetching}
      >
        {repos.error.message}
      </ErrorNotice>
    )
  }
  const active = (repos.data ?? []).filter((repo) => !repo.archived).map((repo) => repo.name)
  return (
    <section
      aria-labelledby={headingId}
      className={`${cardClass} flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5`}
    >
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Glyph name={orgView(view).icon} className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Choose repositories
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{children}</p>
        </div>
      </div>
      {active.length > 0 && active.length <= MAX_REPOS && (
        <button
          type="button"
          onClick={() => repoSelection.setSelected(active)}
          className={`${buttonClass.secondary} max-sm:ml-11`}
        >
          {active.length === 1 ? `Show ${active[0]}` : `Show all ${active.length} repositories`}
        </button>
      )}
    </section>
  )
}
