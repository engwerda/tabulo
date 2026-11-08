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

/** The heading of an org-level view: the organization and the chosen repositories. */
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <OrgSwitcher org={org} view={view} />
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            /
          </span>
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
        {children}
      </div>
      {repos.isError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Could not load the repositories of {org}: {repos.error.message}
        </p>
      )}
    </div>
  )
}
