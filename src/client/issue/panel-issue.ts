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
