import {
  type AttentionKind,
  INSIGHT_GRAIN,
  type IncompleteListing,
  type InsightDays,
  type Insights,
} from "../../shared/api.ts"
import { formatCount, formatHours, formatPercent, formatSpan } from "../charts/scale.ts"
import { formatDate, GRAIN_WORDS, hourTitle, spansYears } from "./periods.ts"

export const RANGE_LABELS: Record<InsightDays, { readonly short: string; readonly long: string }> =
  {
    1: { short: "24h", long: "24 hours" },
    7: { short: "7d", long: "7 days" },
    30: { short: "30d", long: "30 days" },
    90: { short: "90d", long: "90 days" },
    180: { short: "6m", long: "6 months" },
    365: { short: "1y", long: "year" },
  }

/**
 * What a change against the period before compares with: a period as long as the window. Hours
 * and days name the range. A window of weeks starts on a Monday and ends today, so its length is
 * given in weeks, rounded, with the first and last day counted as the header's span does.
 */
export const priorLabel = ({ days, window }: Pick<Insights, "days" | "window">) => {
  if (INSIGHT_GRAIN[days] !== "week") return `vs the ${RANGE_LABELS[days].long} before`
  const length = Math.round((Date.parse(window.end) - Date.parse(window.start)) / 86_400_000) + 1
  return `vs the ${Math.round(length / 7)} weeks before`
}

/**
 * Where the window starts: its first hour as "Nov 7, 09:00" for hours, else its first day,
 * with its year when the window ends in a later one.
 */
export const formatWindowStart = ({
  days,
  tz,
  window: { start, end },
  series,
}: Pick<Insights, "days" | "tz" | "window" | "series">) => {
  const first = series[0]?.start
  return INSIGHT_GRAIN[days] === "hour" && first !== undefined
    ? hourTitle(tz)(first)
    : formatDate(start, spansYears([start, end]))
}

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

/**
 * A Markdown summary of the insights for pasting into a chat or a status report, headed with
 * the organization's display name.
 */
export const insightsSummary = (insights: Insights, orgName: string): string => {
  const { tiles } = insights
  const range = RANGE_LABELS[insights.days].long
  const start = formatWindowStart(insights)
  const flow = (label: string, tile: { value: number; previous: number }) =>
    `- **${label}:** ${formatCount(tile.value)} (period before: ${formatCount(tile.previous)})`
  const duration = (label: string, tile: { value: number | null; previous: number | null }) =>
    tile.value === null
      ? []
      : [
          `- **${label}:** ${formatHours(tile.value)}${tile.previous === null ? "" : ` (period before: ${formatHours(tile.previous)})`}`,
        ]

  const lines = [
    `# ${orgName} insights`,
    "",
    `${insights.repoStats.length === 1 ? "1 repository" : `${insights.repoStats.length} repositories`}, last ${range} in whole ${GRAIN_WORDS[INSIGHT_GRAIN[insights.days]].many} (${formatSpan(insights.window.start, insights.window.end)}, ${insights.tz}).`,
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
          `- **CI pass rate:** ${formatPercent(tiles.ciSuccessRate.value)}${tiles.ciSuccessRate.previous === null ? "" : ` (period before: ${formatPercent(tiles.ciSuccessRate.previous)})`}`,
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
