import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { fetchOrgRepos, fetchOrgs } from "../api.ts"
import { ORGS, OrgSwitcher } from "./OrgPicker.tsx"
import { RepoPicker } from "./RepoPicker.tsx"
import type { RepoSelection } from "./use-repo-selection.ts"
import { type OrgViewId, orgView } from "./views.ts"

type ScopeBarProps = {
  readonly org: string
  readonly view: OrgViewId
  readonly repoSelection: RepoSelection
  /** The view's own controls, shown after the repository picker. */
  readonly children?: ReactNode
}

/**
 * The header of an org-level view: the organization, the chosen repositories, and the view's own
 * controls at the end. Its frame matches the board's header, so switching views moves nothing.
 * The view's name is in the navigation, so here it is only the page's heading for assistive
 * technology.
 */
export const ScopeBar = ({ org, view, repoSelection, children }: ScopeBarProps) => {
  const orgs = useQuery({ queryKey: ORGS, queryFn: fetchOrgs })
  const repos = useQuery({ queryKey: ["org-repos", org], queryFn: () => fetchOrgRepos(org) })
  const [pickerOpen, setPickerOpen] = useState(false)
  const details = orgs.data?.find((candidate) => candidate.name.toLowerCase() === org.toLowerCase())
  const displayName = details?.fullName || org

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:px-6">
      <h1 className="sr-only">
        {orgView(view).label} for {displayName}
      </h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-h-8 min-w-0 flex-1 items-center gap-2">
          <OrgSwitcher org={org} view={view} />
          {!repos.isError && (
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
              /
            </span>
          )}
          {repos.isPending && (
            <span
              aria-hidden="true"
              className="h-8 w-36 animate-shimmer rounded-lg bg-zinc-200/60 pointer-coarse:h-11 max-sm:w-24 dark:bg-zinc-800/60"
            />
          )}
          {repos.data !== undefined && (
            <RepoPicker
              repos={repos.data}
              selected={repoSelection.selected}
              onChange={repoSelection.setSelected}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
            />
          )}
        </div>
        {children !== undefined && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
      {/* Without a selection the view's own notice reports the failure, with a retry. */}
      {repos.isError && repoSelection.selection !== "" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Could not load the repositories of {org}: {repos.error.message}
        </p>
      )}
    </div>
  )
}
