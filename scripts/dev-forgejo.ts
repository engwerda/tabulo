// A local Forgejo for trying Tabulo without a real instance: the test fake, seeded with a
// demo organization, served over HTTP with an authorize page that approves at once.
//
//   node scripts/dev-forgejo.ts          (then `npm run dev` with .dev.vars from --print-vars)

import { createServer } from "node:http"
import {
  createFakeForgejo,
  type FakeActionRun,
  type FakeIssue,
  type FakeLabel,
  type FakeMilestone,
  type FakeRepo,
  type FakeUser,
  FORGEJO_URL,
} from "../test/fake-forgejo.ts"

const PORT = Number(process.env.PORT ?? 3456)
const ORIGIN = `http://localhost:${PORT}`
const APP_URL = process.env.APP_URL ?? "http://localhost:5173"
// The fake accepts only these client credentials and this redirect URI.
const FAKE_REDIRECT_URI = "https://tabulo.example/auth/callback"

if (process.argv.includes("--print-vars")) {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64")
  console.log(
    [
      `APP_URL=${APP_URL}`,
      `FORGEJO_URL=${ORIGIN}`,
      "FORGEJO_CLIENT_ID=test-client-id",
      "FORGEJO_CLIENT_SECRET=test-client-secret",
      `SESSION_ENCRYPTION_KEY=${key}`,
    ].join("\n"),
  )
  process.exit(0)
}

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const ago = (days: number) => new Date(now - days * DAY).toISOString()

const person = (id: number, login: string, fullName: string): FakeUser => ({
  id,
  login,
  full_name: fullName,
  avatar_url: `${ORIGIN}/avatars/${login}`,
})

const ada = person(7, "ada", "Ada Lovelace")
const grace = person(9, "grace", "Grace Hopper")
const alan = person(12, "alan", "Alan Turing")
const katherine = person(13, "katherine", "Katherine Johnson")
const people = [ada, grace, alan, katherine]

let labelId = 0
const label = (name: string, color: string, exclusive = false): FakeLabel => {
  labelId += 1
  return {
    id: labelId,
    name,
    color,
    exclusive,
    description: "",
    url: `${ORIGIN}/api/v1/orgs/acme/labels/${labelId}`,
    is_archived: false,
  }
}

const L = {
  progress: label("Status/In Progress", "f59e0b", true),
  review: label("Status/Review", "8b5cf6", true),
  blocked: label("Status/Blocked", "ef4444", true),
  bug: label("Kind/Bug", "dc2626"),
  feature: label("Kind/Feature", "0ea5e9"),
  chore: label("Kind/Chore", "64748b"),
  docs: label("Kind/Docs", "14b8a6"),
  high: label("Priority/High", "b91c1c", true),
  low: label("Priority/Low", "a3a3a3", true),
  ux: label("Area/UX", "ec4899"),
  perf: label("Area/Performance", "22c55e"),
  security: label("Area/Security", "7c3aed"),
  epic: label("Type/Epic", "6366f1"),
}

// A fixed seed, so every start of the demo tells the same history relative to `now`.
let randomState = 20261108
const random = () => {
  randomState = (randomState + 0x6d2b79f5) | 0
  let t = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <A>(items: readonly [A, ...ReadonlyArray<A>]): A =>
  items[Math.floor(random() * items.length)] ?? items[0]

// UTC hours, so the punchcard peaks late morning and mid-afternoon in Europe.
const WORK_HOURS = [7, 8, 8, 9, 9, 9, 10, 10, 11, 12, 12, 13, 13, 13, 14, 14, 15, 16] as const

/** `daysAgo` moved to a working hour, and usually off the weekend. */
const workday = (daysAgo: number) => {
  const date = new Date(now - daysAgo * DAY)
  const weekday = date.getUTCDay()
  if ((weekday === 0 || weekday === 6) && random() > 0.1) {
    date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 2 : 1))
  }
  date.setUTCHours(pick(WORK_HOURS), Math.floor(random() * 60), 0, 0)
  const moved = (now - date.getTime()) / DAY
  return moved > 0.01 ? moved : Math.max(daysAgo, 0.01)
}

/** Milestones in the order seeds name them by index; `dueIn` is in days, negative when past. */
const MILESTONES = [
  { title: "v1.4", dueIn: -6, closedAgo: null, about: "Search, webhooks, and the dark theme." },
  { title: "v1.5", dueIn: 24, closedAgo: null, about: "Audit log export and the mobile beta." },
  { title: "Q1 launch", dueIn: 80, closedAgo: null, about: "Everything the public launch needs." },
  { title: "v1.3", dueIn: -45, closedAgo: 44, about: "Board drag and drop, labels per org." },
] as const

type Seed = {
  readonly title: string
  readonly labels?: ReadonlyArray<FakeLabel>
  readonly assignees?: ReadonlyArray<FakeUser>
  readonly author?: FakeUser
  /** An index into MILESTONES. */
  readonly milestone?: number
  readonly comments?: number
  /** Days ago, like every time below. Defaults to a week before `updated`. */
  readonly created?: number
  readonly updated: number
  /** When the issue closed or the pull request merged or closed. */
  readonly closed?: number
  /** Makes the seed a pull request; "merged" and "closed" need `closed`. */
  readonly pull?: "open" | "draft" | "merged" | "closed"
  readonly body?: string
}

const milestonesOf = (seeds: ReadonlyArray<Seed>): Array<FakeMilestone> =>
  MILESTONES.map(({ title, dueIn, closedAgo, about }, index) => {
    const issues = seeds.filter((seed) => seed.milestone === index && seed.pull === undefined)
    return {
      id: index + 1,
      title,
      description: about,
      state: closedAgo === null ? "open" : "closed",
      open_issues: issues.filter((seed) => seed.closed === undefined).length,
      closed_issues: issues.filter((seed) => seed.closed !== undefined).length,
      created_at: ago(-dueIn + 70),
      updated_at: ago(Math.max(closedAgo ?? 0, 1)),
      closed_at: closedAgo === null ? null : ago(closedAgo),
      due_on: ago(-dueIn),
    }
  })

const issueBody = (seed: Seed) =>
  seed.pull === undefined
    ? `${seed.title}. This came up in the planning review, and it blocks the **${MILESTONES[seed.milestone ?? 0]?.title}** release notes.\n\n## Acceptance\n\n- [x] Agree on the approach\n- [ ] Works on phones\n- [ ] Covered by a test in \`test/\`\n\n## Notes\n\nKeep the change small. Link the pull request here when it is up.`
    : `${seed.title}.\n\n## Testing\n\n- [x] Unit tests\n- [x] Tried it against the staging instance`

const issuesOf = (
  repo: string,
  seeds: ReadonlyArray<Seed>,
  milestones: ReadonlyArray<FakeMilestone>,
): Array<FakeIssue> =>
  seeds.map((seed, index) => {
    const number = index + 1
    const author = seed.author ?? people[index % people.length] ?? ada
    const html_url = `${ORIGIN}/acme/${repo}/${seed.pull === undefined ? "issues" : "pulls"}/${number}`
    return {
      id: 1000 + number,
      number,
      title: seed.title,
      html_url,
      state: seed.closed === undefined ? "open" : "closed",
      labels: [...(seed.labels ?? [])],
      user: { id: author.id, login: author.login, avatar_url: author.avatar_url },
      assignees: seed.assignees === undefined ? null : seed.assignees.map((user) => ({ ...user })),
      milestone: seed.milestone === undefined ? null : (milestones[seed.milestone] ?? null),
      created_at: ago(seed.created ?? seed.updated + 6),
      updated_at: ago(seed.updated),
      closed_at: seed.closed === undefined ? null : ago(seed.closed),
      comments: seed.comments ?? 0,
      pull_request:
        seed.pull === undefined
          ? null
          : {
              merged: seed.pull === "merged",
              merged_at: seed.pull === "merged" ? ago(seed.closed ?? 0) : null,
              draft: seed.pull === "draft",
              html_url,
            },
      repository: { id: 100, name: repo, owner: "acme", full_name: `acme/${repo}` },
      body: seed.body ?? issueBody(seed),
      is_locked: false,
    }
  })

type RepoExtras = {
  readonly archived?: boolean
  readonly languages?: Record<string, number>
  readonly actionRuns?: ReadonlyArray<FakeActionRun>
}

const repo = (name: string, seeds: ReadonlyArray<Seed>, extras: RepoExtras = {}): FakeRepo => {
  const milestones = milestonesOf(seeds)
  return {
    name,
    private: true,
    archived: extras.archived ?? false,
    writers: ["ada", "grace", "alan"],
    triagers: ["katherine"],
    labels: [],
    issues: issuesOf(name, seeds, milestones),
    failIssueListing: false,
    milestones,
    ...(extras.languages === undefined ? {} : { languages: extras.languages }),
    ...(extras.actionRuns === undefined ? {} : { actionRuns: extras.actionRuns }),
  }
}

const KINDS = [L.bug, L.bug, L.feature, L.feature, L.feature, L.chore, L.docs] as const
const AREAS = [L.ux, L.perf, L.security] as const
const TEAM = [ada, grace, alan, katherine] as const
const PULL_AUTHORS = [ada, ada, grace, grace, grace, alan, alan, katherine] as const

/** Days from opening to closing: many quick fixes, a middle, and a long tail. */
const daysToClose = () => {
  const roll = random()
  if (roll < 0.4) return 0.1 + random() * 2
  if (roll < 0.8) return 2 + random() * 12
  return 14 + random() * 50
}

/**
 * An issue from the past year and a bit, denser in recent months. One that would close in the
 * future, and about one in eight besides, is still open.
 */
const pastIssue = (title: string): Seed => {
  const created = workday(3 + 400 * random() ** 1.3)
  const labels = [pick(KINDS), ...(random() < 0.35 ? [pick(AREAS)] : [])]
  const author = pick(TEAM)
  const comments = Math.floor(random() * 6)
  const target = created - daysToClose()
  if (target < 0.1 || random() < 0.12) {
    return {
      title,
      labels: random() < 0.25 ? [L.blocked, ...labels] : labels,
      ...(random() < 0.6 ? { assignees: [pick(TEAM)] } : {}),
      author,
      comments,
      created,
      updated: Math.min(created, workday(random() * Math.min(created, 60))),
    }
  }
  const moved = workday(target)
  const closed = moved < created ? moved : target
  const milestone =
    closed > 50 ? (random() < 0.6 ? 3 : undefined) : random() < 0.6 ? pick([0, 0, 1]) : undefined
  return {
    title,
    labels,
    assignees: [pick(TEAM)],
    author,
    comments,
    created,
    updated: closed,
    closed,
    ...(milestone === undefined ? {} : { milestone }),
  }
}

const MERGE_HOURS = [1.5, 3, 4, 6, 9, 20, 24, 28, 46, 70, 140] as const

const pastPull = (title: string, created = workday(1 + 340 * random() ** 1.3)): Seed => {
  const closed = created - (pick(MERGE_HOURS) * (0.7 + 0.6 * random())) / 24
  if (closed < 0.02) {
    return {
      title,
      pull: "open",
      author: pick(PULL_AUTHORS),
      labels: [pick(KINDS)],
      created,
      updated: 0.05,
    }
  }
  return {
    title,
    pull: random() < 0.07 ? "closed" : "merged",
    author: pick(PULL_AUTHORS),
    labels: [pick(KINDS)],
    comments: Math.floor(random() * 8),
    created,
    updated: closed,
    closed,
  }
}

/** A dependency update every three weeks, the way a renovate habit looks. */
const dependencyPulls = (title: string): Array<Seed> =>
  Array.from({ length: 16 }, (_, index) => ({
    ...pastPull(title, workday(4 + index * 21 + random() * 3)),
    pull: "merged" as const,
    labels: [L.chore],
  }))

/** Past issues and pull requests, oldest first, so numbers rise with time as on Forgejo. */
const historyOf = (
  issueTitles: ReadonlyArray<string>,
  pullTitles: ReadonlyArray<string>,
  dependencyTitle: string,
): Array<Seed> =>
  [
    ...issueTitles.map(pastIssue),
    ...pullTitles.map((title) => pastPull(title)),
    ...dependencyPulls(dependencyTitle),
  ].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))

/** Today's issues and pull requests, opened over the past two months. */
const current = (seeds: ReadonlyArray<Seed>): Array<Seed> =>
  seeds.map((seed, index) => ({ ...seed, created: seed.created ?? seed.updated + 5 + index * 5 }))

const BRANCHES = [
  "feature/search-limits",
  "fix/webhook-ref",
  "chore/deps",
  "feature/shortcuts",
  "fix/focus-ring",
  "feature/offline-queue",
] as const

/**
 * Workflow runs on weekdays over the past year, newest first. The newest main-branch run of each
 * workflow passes, unless `brokenMain`, which makes the last two CI runs on main fail.
 */
const actionRunsOf = (
  name: string,
  failRate: number,
  titles: readonly [string, ...ReadonlyArray<string>],
  brokenMain = false,
): Array<FakeActionRun> => {
  const runs: Array<Omit<FakeActionRun, "id" | "index_in_repo" | "html_url">> = []
  for (let day = 330; day >= 0; day--) {
    const date = new Date(now - day * DAY)
    const weekday = date.getUTCDay()
    if ((weekday === 0 || weekday === 6) && random() > 0.15) continue
    const count = 1 + Math.floor(random() * 4)
    for (let run = 0; run < count; run++) {
      const started = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        pick(WORK_HOURS),
        Math.floor(random() * 60),
      )
      const onMain = random() < 0.5
      const workflow = onMain && random() < 0.35 ? "deploy.yml" : "ci.yml"
      const minutes = workflow === "deploy.yml" ? 2 + random() * 3 : 4 + random() * 6
      const stopped = started + minutes * 60_000
      if (stopped > now) continue
      const status = random() < failRate ? "failure" : random() < 0.03 ? "cancelled" : "success"
      runs.push({
        title: pick(titles),
        status,
        workflow_id: workflow,
        prettyref: onMain ? "main" : pick(BRANCHES),
        event: onMain ? "push" : "pull_request",
        created: new Date(started - 5_000).toISOString(),
        updated: new Date(stopped).toISOString(),
        started: new Date(started).toISOString(),
        stopped: new Date(stopped).toISOString(),
        duration: Math.round(minutes * 60 * 1e9),
      })
    }
  }
  const newestFirst = runs
    .map((run, index) => ({
      ...run,
      id: 5000 + index,
      index_in_repo: index + 1,
      html_url: `${ORIGIN}/acme/${name}/actions/runs/${index + 1}`,
    }))
    .reverse()
  for (const workflow of ["ci.yml", "deploy.yml"]) {
    const onMain = newestFirst.filter(
      (run) => run.workflow_id === workflow && run.prettyref === "main",
    )
    const broken = brokenMain && workflow === "ci.yml" ? 2 : 0
    onMain.forEach((run, index) => {
      if (index < broken) run.status = "failure"
      else if (index === broken) run.status = "success"
    })
  }
  return newestFirst
}

const apiCurrent = current([
  {
    title: "Rate limit the public search endpoint",
    labels: [L.progress, L.feature, L.high, L.security],
    assignees: [ada],
    milestone: 0,
    comments: 7,
    updated: 0.1,
  },
  {
    title: "Paginate the audit log export",
    labels: [L.feature],
    milestone: 1,
    comments: 2,
    updated: 3,
  },
  {
    title: "500 when a webhook payload has an empty ref",
    labels: [L.bug, L.high],
    assignees: [grace],
    milestone: 0,
    comments: 4,
    updated: 0.4,
  },
  {
    title: "Cache organization labels for a minute",
    labels: [L.review, L.perf],
    assignees: [alan, ada],
    milestone: 0,
    comments: 11,
    updated: 0.05,
  },
  { title: "Drop the v0 token endpoint", labels: [L.chore, L.low], milestone: 2, updated: 12 },
  {
    title: "Document the error codes",
    labels: [L.docs],
    assignees: [katherine],
    milestone: 0,
    updated: 2,
    closed: 1,
  },
  {
    title: "Retry Forgejo reads once on 502",
    labels: [L.blocked, L.feature],
    assignees: [grace],
    comments: 3,
    updated: 5,
  },
  {
    title: "Return X-Total-Count on every list",
    labels: [L.feature],
    milestone: 0,
    updated: 4,
    closed: 3,
    assignees: [alan],
  },
  {
    title: "Add rate limiting to the public search endpoint",
    pull: "open",
    author: grace,
    labels: [L.feature, L.security],
    comments: 2,
    created: 1.2,
    updated: 0.1,
  },
  {
    title: "Cache organization labels for a minute",
    pull: "open",
    author: alan,
    labels: [L.perf],
    comments: 5,
    created: 2.4,
    updated: 0.7,
  },
  {
    title: "Sketch the audit log export format",
    pull: "draft",
    author: ada,
    labels: [L.feature],
    comments: 0,
    created: 1,
    updated: 0.9,
  },
])

const webCurrent = current([
  {
    title: "Dark mode flickers on first load",
    labels: [L.bug, L.ux],
    assignees: [ada],
    milestone: 0,
    comments: 5,
    updated: 1,
  },
  {
    title: "Keyboard shortcuts for the board",
    labels: [L.progress, L.feature, L.ux],
    assignees: [katherine],
    milestone: 1,
    comments: 9,
    updated: 0.2,
  },
  { title: "Empty states for every view", labels: [L.ux], milestone: 1, updated: 6 },
  {
    title: "Bundle size budget in CI",
    labels: [L.review, L.perf, L.chore],
    assignees: [alan],
    comments: 1,
    updated: 0.8,
  },
  {
    title: "Avatars fall back to initials on private instances",
    labels: [L.bug],
    assignees: [grace],
    milestone: 0,
    updated: 2,
    closed: 0.5,
  },
  {
    title: "Settings page for notifications",
    labels: [L.feature],
    milestone: 2,
    comments: 0,
    updated: 9,
  },
  {
    title: "Focus ring is invisible on the dark header",
    labels: [L.bug, L.ux, L.low],
    updated: 7,
  },
  {
    title: "Translate the sign-in page",
    labels: [L.progress, L.docs],
    assignees: [grace, katherine],
    milestone: 2,
    comments: 3,
    updated: 1.5,
  },
  {
    title: "Keyboard shortcuts for the board",
    pull: "open",
    author: katherine,
    labels: [L.feature, L.ux],
    comments: 8,
    created: 3,
    updated: 1.3,
  },
])

const mobileCurrent = current([
  {
    title: "Offline queue for card moves",
    labels: [L.feature, L.high],
    milestone: 2,
    comments: 6,
    updated: 3,
  },
  {
    title: "Crash when rotating the issue view",
    labels: [L.bug, L.high],
    assignees: [alan],
    comments: 8,
    updated: 0.3,
  },
  {
    title: "Push notification opt-in screen",
    labels: [L.review, L.feature, L.ux],
    assignees: [katherine],
    milestone: 2,
    comments: 2,
    updated: 1,
  },
  {
    title: "Upgrade the build toolchain",
    labels: [L.chore],
    assignees: [ada],
    milestone: 1,
    updated: 4,
    closed: 2,
  },
  { title: "Haptic feedback on drop", labels: [L.ux, L.low], updated: 15 },
  {
    title: "Move push tokens to the new store",
    pull: "open",
    author: alan,
    labels: [L.chore],
    comments: 3,
    created: 16,
    updated: 11,
  },
])

const apiPullTitles = [
  "Add request IDs to every log line",
  "Validate webhook signatures before parsing",
  "Stream the audit log instead of buffering it",
  "Index issues by updated time",
  "Return 422 for unknown label ids",
  "Drop the unused session table",
  "Use one database connection per request",
  "Retry token refresh once on 401",
  "Log slow Forgejo reads",
  "Move error mapping into one module",
  "Add OpenAPI descriptions for the board routes",
  "Reject oversized request bodies early",
  "Speed up label lookups with a map",
  "Expire sessions after thirty days idle",
] as const

const webPullTitles = [
  "Lazy load the insights charts",
  "Remember the last organization",
  "Show a toast when a move fails",
  "Make cards draggable with the keyboard",
  "Split the board into smaller components",
  "Add a skeleton while the board loads",
  "Use the system font stack",
  "Fix the label picker on Safari",
  "Animate column counts",
  "Respect reduced motion",
  "Tighten the header on phones",
  "Prefetch the board on hover",
  "Add a filter for unassigned cards",
  "Fix the scroll jump after a drop",
] as const

const mobilePullTitles = [
  "Cache the board for offline reading",
  "Add pull to refresh",
  "Fix the crash on Android 12 back gesture",
  "Show unread notifications on the tab bar",
  "Upgrade React Native",
  "Use the system share sheet for issue links",
  "Persist the session in the keychain",
  "Add a dark launch screen",
  "Fix truncated titles on small phones",
  "Retry failed moves when back online",
] as const

const apiHistory = historyOf(
  [
    "Search ignores the closed filter",
    "Webhook deliveries time out after 10 seconds",
    "Token refresh races when two tabs open",
    "Board endpoint is slow for organizations with 40 repositories",
    "Label colors without a leading hash break the board",
    "Archived repositories still accept writes",
    "Audit log misses label changes",
    "Health check should not touch the database",
    "Milestone due dates shift by a day in UTC-8",
    "Explain the page budget in the README",
    "Rename the session cookie",
    "Errors leak the Forgejo URL",
    "Allow a custom epic label",
    "Ranks drift after many moves in one column",
    "Return the board's Done window in the payload",
    "Add a request timeout to Forgejo reads",
    "Support organizations with spaces in the full name",
    "OAuth callback fails when state has a plus sign",
    "Document the deployment checklist",
    "Count closed issues in the milestone summary",
    "Insights double count reopened issues",
    "Move migrations to a numbered folder",
    "Assignee list misses triage members",
    "Cache control headers on the API",
    "CSV export for insights",
    "Rate limit sign-in attempts",
    "Board answers 500 when a label was deleted",
    "Upgrade to the new Workers runtime",
    "Webhook retries flood the queue after an outage",
    "Return label descriptions in the board payload",
    "Sessions survive a password change",
    "Document the Forgejo scopes Tabulo asks for",
    "Search times out for queries with a slash",
    "Log the Forgejo version at start",
    "Milestone listing ignores the closed state",
    "Board payload repeats every assignee",
    "Reject a done window above a year",
    "Card ranks lost after a repository rename",
  ],
  apiPullTitles,
  "Update npm dependencies",
)

const webHistory = historyOf(
  [
    "Column headers overlap on narrow screens",
    "Drag preview is offset in Firefox",
    "Show who moved a card",
    "Theme toggle forgets the choice",
    "Insights charts lack axis labels",
    "Long titles push the avatar off the card",
    "Repository picker should search",
    "Empty board looks broken",
    "Sign-in button has no focus style",
    "Add a print style for the epics page",
    "Card count is wrong after a filter",
    "Loading spinner never stops after a 503",
    "Make the dashboard the start page",
    "Contrast of muted text in dark mode",
    "Board scrolls to the top after a move",
    "Show the milestone on each card",
    "Use relative times on the dashboard",
    "Filter the board by label",
    "Keyboard trap in the label picker",
    "Favicon missing on Safari",
    "Charts redraw on every keystroke",
    "Avatars blur on high density screens",
    "Explain the colors on the punchcard",
    "Remember the insights range",
    "Error page for a missing organization",
    "Tooltip on the heatmap shows the wrong date",
  ],
  webPullTitles,
  "Update npm dependencies",
)

const mobileHistory = historyOf(
  [
    "App freezes when the network drops mid-move",
    "Sign-in loops on iOS 17",
    "Board columns do not snap on Android",
    "Notifications open the wrong issue",
    "Battery drain from background refresh",
    "Splash screen stays white in dark mode",
    "Avatars missing on cellular data",
    "Add haptics to the column switcher",
    "Text size ignores the system setting",
    "Crash when an issue has no labels",
    "Deep links to epics",
    "Release notes in the app",
    "TestFlight build fails to sign",
    "Swipe to close an issue",
    "Session expires after an hour",
    "Landscape layout for tablets",
    "Pull to refresh conflicts with drag",
    "Accessibility labels on board cards",
    "Images in descriptions overflow",
    "App icon looks blurry on Android",
    "Add a widget for assigned issues",
    "Login screen ignores the instance URL scheme",
    "Board loads twice after resume",
    "Offline banner never hides",
    "Show the epic on child issues",
    "Dates use the device locale",
  ],
  mobilePullTitles,
  "Update Gradle dependencies",
)

const seedLists = {
  api: [...apiHistory, ...apiCurrent],
  web: [...webHistory, ...webCurrent],
  mobile: [...mobileHistory, ...mobileCurrent],
} as const
type RepoName = keyof typeof seedLists

const seedNamed = (name: RepoName, title: string) => {
  const index = seedLists[name].findIndex((seed) => seed.title === title && seed.pull === undefined)
  const seed = seedLists[name][index]
  if (seed === undefined) throw new Error(`acme/${name} has no issue titled "${title}"`)
  return { number: index + 1, seed }
}

/** The titles of the `count` most recently opened past issues of a repository that are closed. */
const closedPast = (history: ReadonlyArray<Seed>, count: number) =>
  history
    .filter((seed) => seed.pull === undefined && seed.closed !== undefined)
    .slice(-count)
    .map((seed) => seed.title)

/**
 * An epic in `home` whose body lists `children`, as a task list with closed children ticked or
 * as a numbered list. Children in other repositories alternate between the `web#3` and
 * `acme/web#3` reference forms.
 */
const epic = (
  home: RepoName,
  seed: Omit<Seed, "body"> & { readonly intro: string; readonly numbered?: boolean },
  children: ReadonlyArray<readonly [RepoName, string]>,
): Seed => {
  const items = children.map(([name, title], index) => {
    const child = seedNamed(name, title)
    const ref =
      name === home
        ? `#${child.number}`
        : index % 2 === 0
          ? `${name}#${child.number}`
          : `acme/${name}#${child.number}`
    return seed.numbered
      ? `${index + 1}. ${ref} ${title}`
      : `- [${child.seed.closed === undefined ? " " : "x"}] ${ref} ${title}`
  })
  const { intro, numbered: _numbered, ...rest } = seed
  return {
    ...rest,
    labels: [L.epic, ...(seed.labels ?? [])],
    body: `${intro}\n\n## Tasks\n\n${items.join("\n")}\n\n## Out of scope\n\nAnything that needs a schema change waits for the next epic.`,
  }
}

const epics: Record<RepoName, Array<Seed>> = {
  api: [
    epic(
      "api",
      {
        title: "Harden the public API before v1.5",
        intro:
          "The public endpoints go to partners in v1.5. Close the gaps that a busy client finds first.",
        labels: [L.progress, L.security],
        assignees: [grace],
        milestone: 1,
        comments: 6,
        created: 52,
        updated: 0.6,
      },
      [
        ["api", "Rate limit the public search endpoint"],
        ["api", "500 when a webhook payload has an empty ref"],
        ["api", "Retry Forgejo reads once on 502"],
        ["api", "Document the error codes"],
        ["api", "Return X-Total-Count on every list"],
        ...closedPast(apiHistory, 3).map((title) => ["api", title] as const),
        ["web", "Avatars fall back to initials on private instances"],
      ],
    ),
  ],
  web: [
    epic(
      "web",
      {
        title: "Accessible board",
        intro: "Everything on the board works with a keyboard and a screen reader, in both themes.",
        numbered: true,
        labels: [L.ux],
        assignees: [katherine],
        milestone: 2,
        comments: 3,
        created: 38,
        updated: 1.2,
      },
      [
        ["web", "Keyboard shortcuts for the board"],
        ["web", "Focus ring is invisible on the dark header"],
        ["web", "Dark mode flickers on first load"],
        ["web", "Empty states for every view"],
        ...closedPast(webHistory, 2).map((title) => ["web", title] as const),
      ],
    ),
  ],
  mobile: [
    epic(
      "mobile",
      {
        title: "Offline-first mobile app",
        intro: "The app keeps working on a train: reads come from the cache and moves queue up.",
        labels: [L.progress, L.feature],
        assignees: [alan, ada],
        comments: 12,
        created: 95,
        updated: 0.9,
      },
      [
        ["mobile", "Offline queue for card moves"],
        ["mobile", "Upgrade the build toolchain"],
        ...closedPast(mobileHistory, 4).map((title) => ["mobile", title] as const),
        ["api", "Paginate the audit log export"],
      ],
    ),
  ],
}

const repos = [
  repo("api", [...seedLists.api, ...epics.api], {
    languages: { TypeScript: 412_300, SQL: 18_900, Shell: 4_200, Dockerfile: 1_100 },
    actionRuns: actionRunsOf("api", 0.06, apiPullTitles),
  }),
  repo("web", [...seedLists.web, ...epics.web], {
    languages: { TypeScript: 538_700, CSS: 61_400, HTML: 7_900, JavaScript: 12_300 },
    actionRuns: actionRunsOf("web", 0.12, webPullTitles),
  }),
  repo("mobile", [...seedLists.mobile, ...epics.mobile], {
    languages: { Kotlin: 221_500, Swift: 189_800, TypeScript: 96_400, Ruby: 6_300 },
    actionRuns: actionRunsOf("mobile", 0.18, mobilePullTitles, true),
  }),
  repo(
    "legacy-portal",
    [
      { title: "Sunset notice banner", labels: [L.chore], updated: 40 },
      { title: "Export old reports as CSV", labels: [L.progress, L.feature], updated: 30 },
    ],
    { archived: true, languages: { PHP: 302_000, JavaScript: 88_000 } },
  ),
]

/**
 * Makes `children` name the epic titled `title` in `home` with `Part of` in their own
 * description, as a team does when the epic does not list them, and records the references in
 * the epic's timeline as Forgejo does.
 */
const linkChildren = (
  home: RepoName,
  title: string,
  children: ReadonlyArray<readonly [RepoName, string]>,
) => {
  const find = (name: RepoName, issueTitle: string) => {
    const issue = repos
      .find((candidate) => candidate.name === name)
      ?.issues.find(
        (candidate) => candidate.title === issueTitle && candidate.pull_request === null,
      )
    if (issue === undefined) throw new Error(`acme/${name} has no issue titled "${issueTitle}"`)
    return issue
  }
  const parent = find(home, title)
  parent.timeline = children.map(([name, childTitle]) => {
    const child = find(name, childTitle)
    child.body = `Part of acme/${home}#${parent.number}\n\n${child.body ?? ""}`
    return { type: "issue_ref", from: { owner: "acme", repo: name, number: child.number } }
  })
}
linkChildren("web", "Accessible board", [
  ["mobile", "Haptic feedback on drop"],
  ["mobile", "Push notification opt-in screen"],
])

// DEMO_EXTRA=300 adds that many issues to a "load" repository, to try a large board.
const extra = Number(process.env.DEMO_EXTRA ?? 0)
if (extra > 0) {
  const statuses = [[], [L.progress], [L.review], [L.blocked]]
  repos.push(
    repo(
      "load",
      Array.from({ length: extra }, (_, index) => ({
        title: `Generated issue ${index + 1} for a large board`,
        labels: [...(statuses[index % statuses.length] ?? []), index % 3 === 0 ? L.bug : L.feature],
        assignees: index % 2 === 0 ? [people[index % people.length] ?? ada] : [],
        comments: index % 7,
        updated: (index % 30) + 0.5,
      })),
    ),
  )
}

/**
 * Ada's contributions over the past year in 15-minute slots: busy weekdays, light weekends, a
 * few quiet weeks off, two crunch weeks worked straight through, and a streak running today.
 */
const heatmapOf = () => {
  const quietWeeks = new Set([6, 19, 20, 33, 44, 45])
  const crunchWeeks = new Set([11, 12])
  const slots: Array<{ timestamp: number; contributions: number }> = []
  for (let day = 364; day >= 0; day--) {
    const date = new Date(now - day * DAY)
    const week = Math.floor(day / 7)
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
    const crunch = crunchWeeks.has(week)
    const active =
      day <= 8 ||
      (!quietWeeks.has(week) && random() < (weekend ? (crunch ? 0.9 : 0.12) : crunch ? 1 : 0.85))
    if (!active) continue
    let left = weekend
      ? 1 + Math.floor(random() * 3)
      : 1 + Math.floor(random() * 8) + (crunch ? 6 : 0)
    while (left > 0) {
      const contributions = Math.min(left, 1 + Math.floor(random() * 3))
      left -= contributions
      const slot =
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), pick(WORK_HOURS)) +
        Math.floor(random() * 4) * 15 * 60_000
      if (slot <= now) slots.push({ timestamp: slot / 1000, contributions })
    }
  }
  return slots
}

const activeIssues = repos
  .filter((candidate) => !candidate.archived)
  .flatMap((candidate) => candidate.issues.filter((issue) => issue.state === "open"))
const openIssues = activeIssues.filter((issue) => issue.pull_request === null)
const assignedToAda = openIssues.filter((issue) =>
  (issue.assignees ?? []).some((assignee) => assignee.login === "ada"),
)
const reviewPulls = activeIssues
  .filter((issue) => issue.pull_request?.draft === false && issue.user.login !== "ada")
  .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
const notifications = reviewPulls.slice(0, 2).map((pull, index) => ({
  id: 70 + index,
  repository: pull.repository,
  subject: {
    title: pull.title,
    url: "",
    html_url: pull.html_url,
    latest_comment_url: "",
    type: "Pull",
    state: "open",
  },
  unread: true,
  pinned: false,
  updated_at: ago(0.05 + index * 0.4),
  url: "",
}))

const forgejo = createFakeForgejo({
  user: ada,
  issues: {
    review_requested: reviewPulls,
    assigned: assignedToAda,
    mentioned: openIssues.filter((issue) => issue.comments > 5).slice(0, 3),
    created: openIssues.filter((issue) => issue.user.login === "ada"),
  },
  notifications,
  otherUsers: [grace, alan, katherine],
  now: new Date().toISOString(),
  maxPageSize: 50,
  heatmap: heatmapOf(),
  orgs: [
    {
      name: "acme",
      full_name: "Acme Corporation",
      avatar_url: `${ORIGIN}/avatars/acme`,
      members: ["ada", "grace", "alan", "katherine"],
      labels: Object.values(L),
      repos,
    },
    {
      name: "open-source",
      full_name: "Acme Open Source",
      avatar_url: `${ORIGIN}/avatars/open-source`,
      members: ["ada"],
      labels: [L.progress, L.bug, L.feature],
      repos: [repo("tabulo-plugins", [{ title: "Plugin manifest schema", updated: 2 }])],
    },
  ],
})

const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#f97316", "#10b981", "#ec4899", "#8b5cf6"]

const avatar = (name: string) => {
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length]
  const letter = `${name.slice(0, 1).toUpperCase()}${name.slice(1, 2)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}"/><text x="32" y="42" font-family="system-ui,sans-serif" font-size="26" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text></svg>`
}

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

const inline = (text: string) =>
  escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")

/** Enough Markdown for the demo descriptions: headings, task lists, lists, and paragraphs. */
const renderDemoMarkdown = (markdown: string) =>
  markdown
    .split(/\n{2,}/)
    .map((block) => {
      const heading = /^(#{1,6}) (.*)$/.exec(block)
      if (heading !== null) {
        const level = heading[1]?.length ?? 2
        return `<h${level}>${inline(heading[2] ?? "")}</h${level}>`
      }
      const lines = block.split("\n")
      if (lines.every((line) => line.startsWith("- "))) {
        const items = lines.map((line) => {
          const task = /^- \[( |x)\] (.*)$/.exec(line)
          return task === null
            ? `<li>${inline(line.slice(2))}</li>`
            : `<li class="task-list-item"><input type="checkbox"${task[1] === "x" ? " checked" : ""} disabled> ${inline(task[2] ?? "")}</li>`
        })
        return `<ul>${items.join("")}</ul>`
      }
      return `<p>${lines.map(inline).join("<br>")}</p>`
    })
    .join("\n")

createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url ?? "/", ORIGIN)
  const send = (response: Response) => {
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    return response.text().then((text) => outgoing.end(text))
  }

  if (url.pathname.startsWith("/avatars/")) {
    return send(
      new Response(avatar(url.pathname.slice("/avatars/".length)), {
        headers: { "content-type": "image/svg+xml", "cache-control": "max-age=3600" },
      }),
    )
  }
  if (url.pathname === "/login/oauth/authorize") {
    const code = forgejo.approve(url.searchParams.get("code_challenge") ?? "")
    const back = new URL(url.searchParams.get("redirect_uri") ?? `${APP_URL}/auth/callback`)
    back.searchParams.set("code", code)
    back.searchParams.set("state", url.searchParams.get("state") ?? "")
    return send(new Response(null, { status: 302, headers: { location: back.toString() } }))
  }

  const chunks: Array<Buffer> = []
  for await (const chunk of incoming) chunks.push(chunk as Buffer)
  let body = Buffer.concat(chunks).toString()
  if (url.pathname === "/login/oauth/access_token") {
    const form = new URLSearchParams(body)
    if (form.has("redirect_uri")) form.set("redirect_uri", FAKE_REDIRECT_URI)
    body = form.toString()
  }
  if (url.pathname === "/api/v1/markdown" && incoming.method === "POST") {
    const { Text } = JSON.parse(body) as { Text: string }
    return send(
      new Response(renderDemoMarkdown(Text), { headers: { "content-type": "text/html" } }),
    )
  }
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (typeof value === "string") headers.set(name, value)
  }
  const method = incoming.method ?? "GET"
  const response = await forgejo.fetch(
    new Request(`${FORGEJO_URL}${url.pathname}${url.search}`, {
      method,
      headers,
      ...(method === "GET" || method === "HEAD" ? {} : { body }),
    }),
  )
  await send(response)
}).listen(PORT, () => {
  console.log(`Fake Forgejo on ${ORIGIN}, signed in as ada. Point FORGEJO_URL at it.`)
})
