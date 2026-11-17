/** What the issue panel needs to know about the issue or pull request it shows. */
export type PanelIssue = {
  /** Lowercased `owner/repo#number`, as `cardKey` writes it; keys the comment draft. */
  readonly key: string
  readonly owner: string
  /** The repository name without its owner. */
  readonly repo: string
  readonly number: number
  readonly kind: "issue" | "pull"
  readonly title: string
  readonly url: string
  readonly closed: boolean
}

/** The panel's issue from Forgejo's `owner/repo` full name and the issue's number. */
export const panelIssue = (
  fullName: string,
  number: number,
  rest: Pick<PanelIssue, "kind" | "title" | "url" | "closed">,
): PanelIssue => {
  const slash = fullName.indexOf("/")
  return {
    key: `${fullName}#${number}`.toLowerCase(),
    owner: fullName.slice(0, slash),
    repo: fullName.slice(slash + 1),
    number,
    ...rest,
  }
}
