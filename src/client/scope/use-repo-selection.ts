import { useEffect, useRef } from "react"
import { useSearchParams } from "wouter"
import { forgetRepos, readRememberedRepos, rememberScope } from "./remembered.ts"

export type RepoSelection = {
  /** The chosen repository names, from the `repos` search parameter. */
  readonly selected: ReadonlyArray<string>
  /** `selected` joined with commas: a stable value for query keys and effect dependencies. */
  readonly selection: string
  readonly setSelected: (repos: ReadonlyArray<string>) => void
}

/**
 * The repositories chosen in an org-level view. They live in the address so a view can be
 * shared, and are remembered per organization for every view.
 */
export const useRepoSelection = (org: string): RepoSelection => {
  const [params, setParams] = useSearchParams()
  const selected = (params.get("repos") ?? "").split(",").filter((name) => name !== "")
  const selection = selected.join(",")

  // The remembered selection fills an empty address once per organization; after that an empty
  // selection is the user's choice.
  const restoredFor = useRef<string | null>(null)
  useEffect(() => {
    const firstVisit = restoredFor.current !== org
    restoredFor.current = org
    const remembered = firstVisit && selection === "" ? readRememberedRepos(org) : null
    if (remembered) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set("repos", remembered)
          return next
        },
        { replace: true },
      )
      return
    }
    rememberScope(org, selection)
  }, [org, selection, setParams])

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

  return { selected, selection, setSelected }
}
