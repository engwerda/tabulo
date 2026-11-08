import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { useSearchParams } from "wouter"
import { fetchOrgRepos } from "../api.ts"
import { firstVisitChoice } from "./first-visit.ts"
import { forgetRepos, readRememberedRepos, rememberScope } from "./remembered.ts"

export type RepoSelection = {
  /** The chosen repository names, from the `repos` search parameter. */
  readonly selected: ReadonlyArray<string>
  /** `selected` joined with commas: a stable value for query keys and effect dependencies. */
  readonly selection: string
  readonly setSelected: (repos: ReadonlyArray<string>) => void
  /**
   * True while an empty selection is about to be filled on a first visit, mostly while the
   * organization's repositories load: the view shows its loading state, not "none chosen".
   */
  readonly resolving: boolean
}

/**
 * The repositories chosen in an org-level view. They live in the address so a view can be
 * shared, and are remembered per organization for every view.
 */
export const useRepoSelection = (org: string): RepoSelection => {
  const [params, setParams] = useSearchParams()
  const selected = (params.get("repos") ?? "").split(",").filter((name) => name !== "")
  const selection = selected.join(",")
  // Only a first visit needs the organization's repositories. The scope bar asks the same
  // query, so this adds no request.
  const repos = useQuery({ queryKey: ["org-repos", org], queryFn: () => fetchOrgRepos(org) })
  const orgRepos = repos.data

  // The remembered selection fills an empty address once per organization; after that an empty
  // selection is the user's choice. An organization never visited with few enough active
  // repositories shows all of them, so a first visit lands on the view instead of a chooser.
  const restoredFor = useRef<string | null>(null)
  const pending =
    selection === "" && restoredFor.current !== org
      ? firstVisitChoice(readRememberedRepos(org), orgRepos)
      : ""
  const resolving = pending === undefined ? !repos.isError : pending !== ""
  useEffect(() => {
    if (restoredFor.current !== org && selection === "") {
      const choice = firstVisitChoice(readRememberedRepos(org), orgRepos)
      if (choice === undefined) return
      restoredFor.current = org
      if (choice !== "") {
        setParams(
          (current) => {
            const next = new URLSearchParams(current)
            next.set("repos", choice)
            return next
          },
          { replace: true },
        )
        return
      }
    }
    restoredFor.current = org
    rememberScope(org, selection)
  }, [org, selection, setParams, orgRepos])

  const setSelected = (repos: ReadonlyArray<string>) => {
    if (repos.length === 0) forgetRepos(org)
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (repos.length === 0) next.delete("repos")
        else next.set("repos", repos.join(","))
        return next
      },
      { replace: true },
    )
  }

  return { selected, selection, setSelected, resolving }
}
