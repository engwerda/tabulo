import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { Link } from "wouter"
import { Avatar } from "../Avatar.tsx"
import { fetchOrgRepos, fetchOrgs } from "../api.ts"
import { ORGS } from "./OrgPicker.tsx"
import { RepoPicker } from "./RepoPicker.tsx"
import type { RepoSelection } from "./use-repo-selection.ts"
import { type OrgViewId, orgView, orgViewHref } from "./views.ts"

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
  const details = orgs.data?.find((candidate) => candidate.name.toLowerCase() === org.toLowerCase())
  const displayName = details?.fullName || org

  return (
    <div className="flex flex-col gap-3 px-4 pb-3 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            key={details?.avatarUrl ?? ""}
            url={details?.avatarUrl ?? ""}
            name={displayName}
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg/6 font-semibold">
              <span className="sr-only">{orgView(view).label} for </span>
              {displayName}
            </h1>
            <Link
              href={orgViewHref(view)}
              className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Change organization
            </Link>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {repos.data !== undefined && (
          <RepoPicker
            repos={repos.data}
            selected={repoSelection.selected}
            onChange={repoSelection.setSelected}
          />
        )}
        {repos.isError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            Could not load the repositories of {org}: {repos.error.message}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
