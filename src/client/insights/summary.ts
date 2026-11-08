import type { AttentionKind, IncompleteListing, InsightDays, Insights } from "../../shared/api.ts"
import { formatCount, formatDay, formatHours, formatPercent, formatSpan } from "../charts/scale.ts"

export const RANGE_LABELS: Record<InsightDays, { readonly short: string; readonly long: string }> =
  {
    30: { short: "30d", long: "30 days" },
    90: { short: "90d", long: "90 days" },
    180: { short: "6m", long: "6 months" },
    365: { short: "1y", long: "year" },
  }

/**
 * The days the window covers, counting its first and last day as the header's span does. It
 * starts on a Monday, so a 30-day period covers 30 to 36 days.
 */
export const windowDays = ({ start, end }: Insights["window"]) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1

/** What a change against the period before compares with: a period as long as the window. */
export const priorLabel = (window: Insights["window"]) => `vs prior ${windowDays(window)} days`

export const ATTENTION_LABELS: Record<AttentionKind, string> = {
  failing_ci: "CI failing",
  overdue_milestone: "Overdue milestone",
  stale_pull: "Idle pull request",
  stale_issue: "Idle issue",
}

const LISTING_LABELS: Record<IncompleteListing["listing"], string> = {
  open: "open issues and pull requests",
  closed: "closed issues and pull requests",
  runs: "CI runs",
  milestones: "milestones",
}

/** The listings Tabulo stopped reading early, as a sentence. */
export const incompleteNotice = (incomplete: ReadonlyArray<IncompleteListing>) =>
  `Tabulo reached its limit of Forgejo requests and read only part of the ${incomplete
    .map(({ repo, listing }) => `${LISTING_LABELS[listing]} of ${repo}`)
    .join(", ")}. Numbers that count them are too low.`

const signed = (value: number) => `${value > 0 ? "+" : ""}${formatCount(value)}`

/** A Markdown summary of the insights for pasting into a chat or a status report. */
export const insightsSummary = (insights: Insights): string => {
  const { tiles } = insights
  const range = RANGE_LABELS[insights.days].long
  const start = formatDay(insights.window.start)
  const flow = (label: string, tile: { value: number; previous: number }) =>
    `- **${label}:** ${formatCount(tile.value)} (period before: ${formatCount(tile.previous)})`
  const duration = (label: string, tile: { value: number | null; previous: number | null }) =>
    tile.value === null
      ? []
      : [
          `- **${label}:** ${formatHours(tile.value)}${tile.previous === null ? "" : ` (period before: ${formatHours(tile.previous)})`}`,
        ]

  const lines = [
    `# ${insights.org} insights`,
    "",
    `${insights.repoStats.length === 1 ? "1 repository" : `${insights.repoStats.length} repositories`}, last ${range} in whole weeks (${formatSpan(insights.window.start, insights.window.end)}, ${insights.tz}).`,
    "",
    "## Headline numbers",
    "",
    `- **Open issues:** ${formatCount(tiles.openIssues.value)} (${signed(tiles.openIssues.value - tiles.openIssues.previous)} since ${start})`,
    `- **Open pull requests:** ${formatCount(tiles.openPulls.value)} (${signed(tiles.openPulls.value - tiles.openPulls.previous)} since ${start})`,
    flow("Issues opened", tiles.issuesOpened),
    flow("Issues closed", tiles.issuesClosed),
    flow("Pull requests merged", tiles.pullsMerged),
    ...duration("Median time to close an issue", tiles.medianIssueCloseHours),
    ...duration("Median time to merge a pull request", tiles.medianPullMergeHours),
    ...(tiles.ciSuccessRate.value === null
      ? []
      : [
          `- **CI success rate:** ${formatPercent(tiles.ciSuccessRate.value)}${tiles.ciSuccessRate.previous === null ? "" : ` (period before: ${formatPercent(tiles.ciSuccessRate.previous)})`}`,
        ]),
  ]

  if (insights.attention.length > 0) {
    lines.push("", "## Needs attention", "")
    for (const item of insights.attention) {
      lines.push(
        `- ${ATTENTION_LABELS[item.kind]} in ${item.repo}: [${item.title}](${item.url}), ${item.detail} (${item.ageDays}d)`,
      )
    }
  }

  if (insights.repoStats.length > 0) {
    lines.push("", "## Repository health", "")
    for (const repo of [...insights.repoStats].sort((a, b) => a.health.score - b.health.score)) {
      const reasons = repo.health.reasons.length === 0 ? "" : `: ${repo.health.reasons.join("; ")}`
      lines.push(`- **${repo.name}** ${repo.health.score} (${repo.health.status})${reasons}`)
    }
  }

  if (insights.failedRepos.length > 0) {
    lines.push(
      "",
      `Not included, because they failed to load: ${insights.failedRepos.map((failed) => failed.repo).join(", ")}.`,
    )
  }
  if (insights.incomplete.length > 0) lines.push("", incompleteNotice(insights.incomplete))
  return `${lines.join("\n")}\n`
}
