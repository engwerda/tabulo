import type { OrgRepo } from "../../shared/api.ts"

/** The server's limit on repositories per view, and the most a first visit chooses by itself. */
export const MAX_REPOS = 20

/**
 * What an empty address chooses on the first visit to an organization: the remembered
 * repositories, else every active repository when there are few enough, as a comma-separated
 * list (`""` for none). `undefined` means the answer waits on the organization's repositories.
 */
export const firstVisitChoice = (
  remembered: string | null,
  orgRepos: ReadonlyArray<Pick<OrgRepo, "name" | "archived">> | undefined,
): string | undefined => {
  if (remembered !== null) return remembered
  if (orgRepos === undefined) return undefined
  const active = orgRepos.filter((repo) => !repo.archived).map((repo) => repo.name)
  return active.length > 0 && active.length <= MAX_REPOS ? active.join(",") : ""
}
