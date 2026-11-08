import { createContext, type ReactNode, useContext } from "react"
import { REPO_COLORS, repoColor } from "../format.ts"

const RepoPalette = createContext<ReadonlyMap<string, string>>(new Map())

/**
 * Gives the board's repositories colors in the order they are listed, so up to ten repositories
 * never share one. Names outside the list fall back to a hashed color.
 */
export const RepoPaletteProvider = ({
  repos,
  children,
}: {
  repos: ReadonlyArray<string>
  children: ReactNode
}) => {
  const palette = new Map(
    repos.map((repo, index) => [repo, REPO_COLORS[index % REPO_COLORS.length] ?? "#0ea5e9"]),
  )
  return <RepoPalette.Provider value={palette}>{children}</RepoPalette.Provider>
}

export const useRepoColor = (repo: string) => useContext(RepoPalette).get(repo) ?? repoColor(repo)
