import type {
  AttentionItem,
  AttentionKind,
  Bucket,
  CiSummary,
  HealthStatus,
  InsightDays,
  Insights,
  Language,
  RepoInsight,
} from "../shared/api.ts"
import {
  type ForgejoActionRun,
  type ForgejoInsightIssue,
  type ForgejoInsightRepo,
  type ForgejoLanguages,
  type ForgejoMilestone,
  labelHexColor,
} from "./forgejo/schemas.ts"
import { addDays, DAY_MS, weekStart, zonedTime } from "./time-zone.ts"

const HOUR_MS = 60 * 60 * 1000

/** What Tabulo reads from Forgejo for one repository. */
export type RepoActivity = {
  readonly repo: ForgejoInsightRepo
  /** Open issues and pull requests. */
  readonly open: ReadonlyArray<ForgejoInsightIssue>
  /** Closed issues and pull requests updated since the previous window started. */
  readonly closed: ReadonlyArray<ForgejoInsightIssue>
  /** Workflow runs created since the previous window started; null when there is no CI data. */
  readonly runs: ReadonlyArray<ForgejoActionRun> | null
  readonly languages: ForgejoLanguages
  readonly milestones: ReadonlyArray<ForgejoMilestone>
}

export type InsightsInput = {
  readonly org: string
  readonly repos: ReadonlyArray<string>
  readonly days: InsightDays
  readonly tz: string
  /** Epoch milliseconds. */
  readonly now: number
  readonly loaded: ReadonlyArray<RepoActivity>
  readonly failedRepos: ReadonlyArray<{ readonly repo: string; readonly message: string }>
}

type Person = { readonly login: string; readonly avatarUrl: string }

/** An issue or pull request with its times parsed to epoch milliseconds. */
type Item = {
  readonly repo: string
  readonly kind: "issue" | "pull"
  readonly number: number
  readonly title: string
  readonly url: string
  readonly author: Person
  readonly assignees: ReadonlyArray<Person>
  readonly labels: ReadonlyArray<{ readonly name: string; readonly color: string }>
  readonly created: number
  readonly updated: number
  /** Closed or merged; null while open. */
  readonly closed: number | null
  readonly merged: number | null
  readonly draft: boolean
}

type RunOutcome = "success" | "failure" | "other"

type Run = {
  readonly repo: string
  readonly workflow: string
  readonly branch: string
  readonly url: string
  readonly created: number
  readonly outcome: RunOutcome
  /** Finished runs only. */
  readonly durationMinutes: number | null
}

/** A half-open span of time, `[start, end)`. */
type Period = { readonly start: number; readonly end: number }

const within = (period: Period, time: number | null): time is number =>
  time !== null && time >= period.start && time < period.end

const count = <A>(items: ReadonlyArray<A>, predicate: (item: A) => boolean) =>
  items.reduce((total, item) => (predicate(item) ? total + 1 : total), 0)

const groupBy = <A>(items: ReadonlyArray<A>, key: (item: A) => string) => {
  const groups = new Map<string, Array<A>>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

const round1 = (value: number) => Math.round(value * 10) / 10

/** The `q` quantile (0 to 1) with linear interpolation between ranks, or null for no values. */
export const quantile = (values: ReadonlyArray<number>, q: number): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const lower = sorted[Math.floor(position)] ?? 0
  const upper = sorted[Math.ceil(position)] ?? 0
  return lower + (upper - lower) * (position - Math.floor(position))
}

const median = (values: ReadonlyArray<number>) => quantile(values, 0.5)

const roundedOrNull = (value: number | null) => (value === null ? null : round1(value))

const toPerson = ({ login, avatar_url }: { login: string; avatar_url: string }): Person => ({
  login,
  avatarUrl: avatar_url,
})

const toItem =
  (repo: string) =>
  (issue: ForgejoInsightIssue): Item => ({
    repo,
    kind: issue.pull_request == null ? "issue" : "pull",
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    author: toPerson(issue.user),
    assignees: (issue.assignees ?? []).map(toPerson),
    labels: issue.labels,
    created: Date.parse(issue.created_at),
    updated: Date.parse(issue.updated_at),
    closed: issue.closed_at === null ? null : Date.parse(issue.closed_at),
    merged:
      issue.pull_request?.merged === true && issue.pull_request.merged_at !== null
        ? Date.parse(issue.pull_request.merged_at)
        : null,
    draft: issue.pull_request?.draft === true,
  })

const workflowName = (workflowId: string) => workflowId.replace(/\.ya?ml$/, "")

const RUN_OUTCOMES: Partial<Record<string, RunOutcome>> = { success: "success", failure: "failure" }

/** Parses a run's times. Only runs that passed or failed have a duration. */
export const toRun =
  (repo: string) =>
  (run: ForgejoActionRun): Run => {
    const outcome = RUN_OUTCOMES[run.status] ?? "other"
    const started = run.started === null ? Number.NaN : Date.parse(run.started)
    const stopped = run.stopped === null ? Number.NaN : Date.parse(run.stopped)
    return {
      repo,
      workflow: workflowName(run.workflow_id),
      branch: run.prettyref,
      url: run.html_url,
      created: Date.parse(run.created),
      outcome,
      durationMinutes:
        outcome !== "other" && stopped >= started ? round1((stopped - started) / 60_000) : null,
    }
  }

const successRate = (runs: ReadonlyArray<Run>) => {
  const passed = count(runs, (run) => run.outcome === "success")
  const decided = passed + count(runs, (run) => run.outcome === "failure")
  return decided === 0 ? null : passed / decided
}

const histogram = (
  values: ReadonlyArray<number>,
  buckets: ReadonlyArray<readonly [label: string, below: number]>,
): Array<Bucket> =>
  buckets.map(([label, below], index) => {
    const from = index === 0 ? Number.NEGATIVE_INFINITY : (buckets[index - 1]?.[1] ?? 0)
    return { label, count: count(values, (value) => value >= from && value < below) }
  })

const MERGE_HOUR_BUCKETS = [
  ["< 1h", 1],
  ["1–4h", 4],
  ["4–24h", 24],
  ["1–3d", 72],
  ["3–7d", 168],
  ["1–2w", 336],
  ["> 2w", Number.POSITIVE_INFINITY],
] as const

const ISSUE_AGE_DAY_BUCKETS = [
  ["< 1w", 7],
  ["1–4w", 28],
  ["1–3m", 91],
  ["3–12m", 365],
  ["> 1y", Number.POSITIVE_INFINITY],
] as const

const TOP_LANGUAGES = 5

/** The largest languages by bytes, with the rest summed as "Other". */
export const topLanguages = (bytes: ForgejoLanguages, limit = TOP_LANGUAGES): Array<Language> => {
  const sorted = Object.entries(bytes)
    .filter(([, size]) => size > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
  const rest = sorted.slice(limit).reduce((total, [, size]) => total + size, 0)
  return [
    ...sorted.slice(0, limit).map(([name, size]) => ({ name, bytes: size })),
    ...(rest > 0 ? [{ name: "Other", bytes: rest }] : []),
  ]
}

const STALE_PULL_DAYS = 7
const STALE_ISSUE_DAYS = 21
const MAX_ATTENTION = 15

const ATTENTION_ORDER: ReadonlyArray<AttentionKind> = [
  "failing_ci",
  "overdue_milestone",
  "stale_pull",
  "stale_issue",
]

/** Most urgent first: by kind, then the oldest first within a kind. */
export const byUrgency = (a: AttentionItem, b: AttentionItem) =>
  ATTENTION_ORDER.indexOf(a.kind) - ATTENTION_ORDER.indexOf(b.kind) || b.ageDays - a.ageDays

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What the health rules read about one repository. */
export type RepoFacts = {
  readonly archived: boolean
  /** Passed share of the runs that passed or failed in the window. */
  readonly ciSuccessRate: number | null
  readonly failingDefaultBranch: boolean
  readonly medianMergeHours: number | null
  /** Open, non-draft pull requests without an update for a week. */
  readonly stalePulls: number
  readonly openIssues: number
  readonly openIssuesAtStart: number
  readonly daysSinceActivity: number
  readonly overdueMilestones: number
}

type Penalty = { readonly penalty: number; readonly reason: string }

/**
 * The repository health rules. A repository starts at 100 and each rule that applies subtracts
 * its penalty and gives a reason. The score is never below 0.
 */
export const HEALTH_RULES: ReadonlyArray<(facts: RepoFacts) => Penalty | null> = [
  ({ ciSuccessRate: rate }) =>
    rate === null || rate >= 0.9
      ? null
      : {
          penalty: rate < 0.7 ? 30 : 15,
          reason: `CI passes ${Math.round(rate * 100)}% of runs`,
        },
  ({ failingDefaultBranch }) =>
    failingDefaultBranch ? { penalty: 15, reason: "CI fails on the default branch" } : null,
  ({ medianMergeHours: hours }) =>
    hours === null || hours <= 72
      ? null
      : {
          penalty: hours > 168 ? 15 : 5,
          reason: `Pull requests take ${round1(hours / 24)} days to merge (median)`,
        },
  ({ stalePulls }) =>
    stalePulls === 0
      ? null
      : {
          penalty: Math.min(20, stalePulls * 5),
          reason: `${plural(stalePulls, "pull request")} idle for a week or more`,
        },
  ({ openIssues, openIssuesAtStart }) =>
    openIssues - openIssuesAtStart >= 5 &&
    (openIssues - openIssuesAtStart) / Math.max(openIssuesAtStart, 1) >= 0.25
      ? { penalty: 15, reason: `Open issues grew from ${openIssuesAtStart} to ${openIssues}` }
      : null,
  ({ archived, daysSinceActivity: days }) =>
    archived || days <= 21
      ? null
      : { penalty: days > 60 ? 25 : 10, reason: `No activity for ${days} days` },
  ({ overdueMilestones }) =>
    overdueMilestones === 0
      ? null
      : {
          penalty: Math.min(20, overdueMilestones * 10),
          reason: `${plural(overdueMilestones, "milestone")} overdue`,
        },
]

export const repoHealth = (facts: RepoFacts): RepoInsight["health"] => {
  const penalties = HEALTH_RULES.flatMap((rule) => rule(facts) ?? []).sort(
    (a, b) => b.penalty - a.penalty,
  )
  const score = Math.max(0, 100 - penalties.reduce((total, { penalty }) => total + penalty, 0))
  const status: HealthStatus = score >= 80 ? "strong" : score >= 60 ? "watch" : "risky"
  return { score, status, reasons: penalties.map(({ reason }) => reason) }
}

/** The workflows whose latest finished run on the default branch failed. */
const failingWorkflows = (repo: ForgejoInsightRepo, runs: ReadonlyArray<Run>, now: number) => {
  const byWorkflow = groupBy(
    runs.filter((run) => run.branch === repo.default_branch && run.outcome !== "other"),
    (run) => run.workflow,
  )
  return [...byWorkflow.entries()].flatMap(([workflow, list]): Array<AttentionItem> => {
    const newestFirst = list.sort((a, b) => b.created - a.created)
    const streak = newestFirst.findIndex((run) => run.outcome !== "failure")
    const failures = newestFirst.slice(0, streak === -1 ? newestFirst.length : streak)
    const latest = failures[0]
    const oldest = failures.at(-1)
    if (latest === undefined || oldest === undefined) return []
    return [
      {
        kind: "failing_ci",
        repo: repo.name,
        title: `${workflow} on ${repo.default_branch}`,
        url: latest.url,
        detail:
          failures.length === 1
            ? "The latest run failed"
            : `The last ${failures.length} runs failed`,
        ageDays: Math.floor((now - oldest.created) / DAY_MS),
      },
    ]
  })
}

/** Every aggregate on the insights page, from the repositories Tabulo read. */
export const buildInsights = (input: InsightsInput): Insights => {
  const { now, days } = input
  const window: Period = { start: now - days * DAY_MS, end: Number.POSITIVE_INFINITY }
  const previous: Period = { start: window.start - days * DAY_MS, end: window.start }
  const zoned = zonedTime(input.tz)
  const weekOf = (time: number) => weekStart(zoned(time))
  const ageDays = (time: number) => Math.floor((now - time) / DAY_MS)

  const repos = input.loaded.map((activity) => {
    const items = new Map<number, Item>()
    for (const item of [...activity.closed, ...activity.open].map(toItem(activity.repo.name))) {
      items.set(item.number, item)
    }
    return {
      activity,
      items: [...items.values()],
      runs: activity.runs?.map(toRun(activity.repo.name)) ?? null,
    }
  })
  const items = repos.flatMap((repo) => repo.items)
  const issues = items.filter((item) => item.kind === "issue")
  const pulls = items.filter((item) => item.kind === "pull")
  const runs = repos.flatMap((repo) => repo.runs ?? [])

  const openAt = (list: ReadonlyArray<Item>, time: number) =>
    count(list, (item) => item.created < time && (item.closed === null || item.closed >= time))
  const openNow = (list: ReadonlyArray<Item>) => count(list, (item) => item.closed === null)
  const closeHours = (period: Period) =>
    issues.flatMap((item) =>
      within(period, item.closed) ? [(item.closed - item.created) / HOUR_MS] : [],
    )
  const mergeHours = (period: Period, list: ReadonlyArray<Item> = pulls) =>
    list.flatMap((item) =>
      within(period, item.merged) ? [(item.merged - item.created) / HOUR_MS] : [],
    )
  const runsIn = (period: Period, list: ReadonlyArray<Run> = runs) =>
    list.filter((run) => within(period, run.created))
  const anyCi = repos.some((repo) => repo.runs !== null)

  const tile = (measure: (period: Period) => number) => ({
    value: measure(window),
    previous: measure(previous),
  })
  const optionalTile = (measure: (period: Period) => number | null) => ({
    value: roundedOrNull(measure(window)),
    previous: roundedOrNull(measure(previous)),
  })

  // Weeks, Monday first, from the week the window starts in to the current week.
  const weeks: Array<string> = []
  for (let week = weekOf(window.start); week <= weekOf(now); week = addDays(week, 7)) {
    weeks.push(week)
  }
  const weekIndex = new Map(weeks.map((week, index) => [week, index] as const))
  const perWeek = (times: ReadonlyArray<number | null>) => {
    const counts = weeks.map(() => 0)
    for (const time of times) {
      if (!within(window, time)) continue
      const index = weekIndex.get(weekOf(time))
      if (index !== undefined) counts[index] = (counts[index] ?? 0) + 1
    }
    return counts
  }
  // An issue counts toward a week's backlog when it was created by the week's end and closed
  // after it. Week keys compare as strings.
  const issueWeeks = issues.map((item) => ({
    created: weekOf(item.created),
    closed: item.closed === null ? null : weekOf(item.closed),
  }))
  const issuesOpened = perWeek(issues.map((item) => item.created))
  const issuesClosed = perWeek(issues.map((item) => item.closed))
  const pullsOpened = perWeek(pulls.map((item) => item.created))
  const pullsMerged = perWeek(pulls.map((item) => item.merged))
  const weekly = weeks.map((week, index) => ({
    weekStart: week,
    issuesOpened: issuesOpened[index] ?? 0,
    issuesClosed: issuesClosed[index] ?? 0,
    pullsOpened: pullsOpened[index] ?? 0,
    pullsMerged: pullsMerged[index] ?? 0,
    openIssues: count(
      issueWeeks,
      ({ created, closed }) => created <= week && (closed === null || closed > week),
    ),
  }))

  const windowMergeHours = mergeHours(window)
  const punchcard = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const item of items) {
    for (const time of [item.created, item.closed]) {
      if (!within(window, time)) continue
      const { weekday, hour } = zoned(time)
      const row = punchcard[weekday]
      if (row !== undefined) row[hour] = (row[hour] ?? 0) + 1
    }
  }

  const labelCounts = new Map<string, { name: string; color: string; count: number }>()
  for (const item of issues) {
    if (item.closed !== null) continue
    for (const { name, color } of item.labels) {
      const entry = labelCounts.get(name) ?? { name, color: labelHexColor(color), count: 0 }
      labelCounts.set(name, { ...entry, count: entry.count + 1 })
    }
  }

  const contributors = new Map<string, Person & { pullsMerged: number; issuesClosed: number }>()
  const credit = (person: Person, field: "pullsMerged" | "issuesClosed") => {
    const entry = contributors.get(person.login) ?? { ...person, pullsMerged: 0, issuesClosed: 0 }
    contributors.set(person.login, { ...entry, [field]: entry[field] + 1 })
  }
  for (const item of pulls) if (within(window, item.merged)) credit(item.author, "pullsMerged")
  for (const item of issues) {
    if (within(window, item.closed))
      for (const person of item.assignees) credit(person, "issuesClosed")
  }

  const languageBytes: Record<string, number> = {}
  for (const { activity } of repos) {
    for (const [name, size] of Object.entries(activity.languages)) {
      languageBytes[name] = (languageBytes[name] ?? 0) + size
    }
  }

  const windowRuns = runsIn(window)
  const ci: CiSummary | null = anyCi
    ? {
        runs: windowRuns.length,
        successRate: successRate(windowRuns),
        medianDurationMinutes: roundedOrNull(
          median(windowRuns.flatMap((run) => run.durationMinutes ?? [])),
        ),
        weekly: (() => {
          const outcomes = (outcome: RunOutcome) =>
            perWeek(windowRuns.flatMap((run) => (run.outcome === outcome ? [run.created] : [])))
          const [success, failure, other] = [
            outcomes("success"),
            outcomes("failure"),
            outcomes("other"),
          ]
          return weeks.map((week, index) => ({
            weekStart: week,
            success: success[index] ?? 0,
            failure: failure[index] ?? 0,
            other: other[index] ?? 0,
          }))
        })(),
        slowestWorkflows: [...groupBy(windowRuns, (run) => `${run.repo}/${run.workflow}`).values()]
          .flatMap(([first, ...rest]) => {
            const minutes = median([first, ...rest].flatMap((run) => run?.durationMinutes ?? []))
            return first === undefined || minutes === null
              ? []
              : [
                  {
                    name: first.workflow,
                    repo: first.repo,
                    medianDurationMinutes: round1(minutes),
                    runs: rest.length + 1,
                  },
                ]
          })
          .sort((a, b) => b.medianDurationMinutes - a.medianDurationMinutes)
          .slice(0, 5),
      }
    : null

  const isOverdue = (milestone: ForgejoMilestone) =>
    milestone.due_on != null && Date.parse(milestone.due_on) < now && milestone.open_issues > 0
  const isStalePull = (item: Item) =>
    item.kind === "pull" &&
    item.closed === null &&
    !item.draft &&
    ageDays(item.updated) >= STALE_PULL_DAYS

  const attention: Array<AttentionItem> = repos.flatMap(
    ({ activity, items: repoItems, runs: repoRuns }) => [
      ...failingWorkflows(activity.repo, repoRuns ?? [], now),
      ...activity.milestones.filter(isOverdue).map(
        (milestone): AttentionItem => ({
          kind: "overdue_milestone",
          repo: activity.repo.name,
          title: milestone.title,
          url: `${activity.repo.html_url}/milestone/${milestone.id}`,
          detail: `${milestone.open_issues} of ${milestone.open_issues + milestone.closed_issues} issues open`,
          ageDays: ageDays(Date.parse(milestone.due_on ?? "")),
        }),
      ),
      ...repoItems.filter(isStalePull).map(
        (item): AttentionItem => ({
          kind: "stale_pull",
          repo: item.repo,
          title: item.title,
          url: item.url,
          detail: `#${item.number} by @${item.author.login}`,
          ageDays: ageDays(item.updated),
        }),
      ),
      ...repoItems
        .filter(
          (item) =>
            item.kind === "issue" &&
            item.closed === null &&
            item.assignees.length > 0 &&
            ageDays(item.updated) >= STALE_ISSUE_DAYS,
        )
        .map(
          (item): AttentionItem => ({
            kind: "stale_issue",
            repo: item.repo,
            title: item.title,
            url: item.url,
            detail: `#${item.number}, assigned to ${item.assignees.map((person) => `@${person.login}`).join(", ")}`,
            ageDays: ageDays(item.updated),
          }),
        ),
    ],
  )

  const repoStats = repos.map(({ activity, items: repoItems, runs: repoRuns }): RepoInsight => {
    const repoIssues = repoItems.filter((item) => item.kind === "issue")
    const repoPulls = repoItems.filter((item) => item.kind === "pull")
    const lastActivity = Math.max(
      Date.parse(activity.repo.updated_at),
      ...repoItems.map((item) => item.updated),
      ...(repoRuns ?? []).map((run) => run.created),
    )
    const repoWindowRuns = repoRuns === null ? null : runsIn(window, repoRuns)
    const facts: RepoFacts = {
      archived: activity.repo.archived,
      ciSuccessRate: repoWindowRuns === null ? null : successRate(repoWindowRuns),
      failingDefaultBranch: failingWorkflows(activity.repo, repoRuns ?? [], now).length > 0,
      medianMergeHours: median(mergeHours(window, repoPulls)),
      stalePulls: count(repoItems, isStalePull),
      openIssues: openNow(repoIssues),
      openIssuesAtStart: openAt(repoIssues, window.start),
      daysSinceActivity: ageDays(lastActivity),
      overdueMilestones: count(activity.milestones, isOverdue),
    }
    return {
      name: activity.repo.name,
      url: activity.repo.html_url,
      archived: activity.repo.archived,
      openIssues: facts.openIssues,
      openPulls: openNow(repoPulls),
      issuesClosed: count(repoIssues, (item) => within(window, item.closed)),
      pullsMerged: count(repoPulls, (item) => within(window, item.merged)),
      lastActivity: new Date(lastActivity).toISOString(),
      languages: topLanguages(activity.languages),
      ci:
        repoWindowRuns === null
          ? null
          : { runs: repoWindowRuns.length, successRate: successRate(repoWindowRuns) },
      activity: perWeek(repoItems.flatMap((item) => [item.created, item.closed])),
      health: repoHealth(facts),
    }
  })

  return {
    org: input.org,
    repos: input.repos,
    days,
    tz: input.tz,
    generatedAt: new Date(now).toISOString(),
    window: { start: new Date(window.start).toISOString(), end: new Date(now).toISOString() },
    tiles: {
      openIssues: { value: openNow(issues), previous: openAt(issues, window.start) },
      openPulls: { value: openNow(pulls), previous: openAt(pulls, window.start) },
      issuesOpened: tile((period) => count(issues, (item) => within(period, item.created))),
      issuesClosed: tile((period) => count(issues, (item) => within(period, item.closed))),
      pullsMerged: tile((period) => count(pulls, (item) => within(period, item.merged))),
      medianIssueCloseHours: optionalTile((period) => median(closeHours(period))),
      medianPullMergeHours: optionalTile((period) => median(mergeHours(period))),
      ciSuccessRate: anyCi
        ? {
            value: successRate(runsIn(window)),
            previous: successRate(runsIn(previous)),
          }
        : { value: null, previous: null },
    },
    weekly,
    pullMergeTime: {
      p50: roundedOrNull(quantile(windowMergeHours, 0.5)),
      p75: roundedOrNull(quantile(windowMergeHours, 0.75)),
      p90: roundedOrNull(quantile(windowMergeHours, 0.9)),
      buckets: histogram(windowMergeHours, MERGE_HOUR_BUCKETS),
    },
    issueAge: histogram(
      issues.flatMap((item) => (item.closed === null ? [(now - item.created) / DAY_MS] : [])),
      ISSUE_AGE_DAY_BUCKETS,
    ),
    labels: [...labelCounts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 10),
    contributors: [...contributors.values()]
      .sort(
        (a, b) =>
          b.pullsMerged + b.issuesClosed - (a.pullsMerged + a.issuesClosed) ||
          a.login.localeCompare(b.login),
      )
      .slice(0, 10),
    punchcard,
    languages: topLanguages(languageBytes),
    ci,
    milestones: repos
      .flatMap(({ activity }) =>
        activity.milestones.map((milestone) => ({
          repo: activity.repo.name,
          title: milestone.title,
          url: `${activity.repo.html_url}/milestone/${milestone.id}`,
          openIssues: milestone.open_issues,
          closedIssues: milestone.closed_issues,
          dueOn: milestone.due_on ?? null,
        })),
      )
      .sort(
        (a, b) =>
          (a.dueOn === null ? Number.POSITIVE_INFINITY : Date.parse(a.dueOn)) -
            (b.dueOn === null ? Number.POSITIVE_INFINITY : Date.parse(b.dueOn)) ||
          a.title.localeCompare(b.title),
      ),
    attention: attention.sort(byUrgency).slice(0, MAX_ATTENTION),
    repoStats,
    failedRepos: input.failedRepos,
  }
}
