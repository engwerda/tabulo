/**
 * How Tabulo writes an issue or pull request reference everywhere: `repo#number`, as Forgejo
 * does, in the text face with tabular digits. Views scoped to one organization pass the bare
 * repository name; views across organizations pass `owner/repo`.
 */
export const IssueRef = ({
  repo,
  number,
  className = "",
}: {
  repo: string
  number: number
  className?: string
}) => (
  <span className={`inline-flex min-w-0 whitespace-nowrap tabular-nums ${className}`}>
    {/* A long repository name gives way before the number does. */}
    <span className="truncate">{repo}</span>
    <span className="shrink-0">#{number}</span>
  </span>
)
