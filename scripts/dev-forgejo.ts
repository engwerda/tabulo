// A local Forgejo for trying Tabulo without a real instance: the test fake, seeded with a
// demo organization, served over HTTP with an authorize page that approves at once.
//
//   node scripts/dev-forgejo.ts          (then `npm run dev` with .dev.vars from --print-vars)

import { createServer } from "node:http"
import {
  createFakeForgejo,
  type FakeIssue,
  type FakeLabel,
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
}

const milestones = ["v1.4", "v1.5", "Q1 launch"].map((title, index) => ({
  id: index + 1,
  title,
  state: "open",
}))

type Seed = {
  readonly title: string
  readonly labels?: ReadonlyArray<FakeLabel>
  readonly assignees?: ReadonlyArray<FakeUser>
  readonly author?: FakeUser
  readonly milestone?: number
  readonly comments?: number
  readonly updated: number
  readonly closed?: number
  readonly body?: string
}

const issuesOf = (repo: string, seeds: ReadonlyArray<Seed>): Array<FakeIssue> =>
  seeds.map((seed, index) => {
    const number = index + 1
    const author = seed.author ?? people[index % people.length] ?? ada
    return {
      id: 1000 + number,
      number,
      title: seed.title,
      html_url: `${ORIGIN}/acme/${repo}/issues/${number}`,
      state: seed.closed === undefined ? "open" : "closed",
      labels: [...(seed.labels ?? [])],
      user: { id: author.id, login: author.login, avatar_url: author.avatar_url },
      assignees: seed.assignees === undefined ? null : seed.assignees.map((user) => ({ ...user })),
      milestone: seed.milestone === undefined ? null : (milestones[seed.milestone] ?? null),
      created_at: ago(seed.updated + 6 + index),
      updated_at: ago(seed.updated),
      closed_at: seed.closed === undefined ? null : ago(seed.closed),
      comments: seed.comments ?? 0,
      pull_request: null,
      repository: { id: 100, name: repo, owner: "acme", full_name: `acme/${repo}` },
      body:
        seed.body ??
        `${seed.title}. This came up in the planning review, and it blocks the **${milestones[seed.milestone ?? 0]?.title}** release notes.\n\n## Acceptance\n\n- [x] Agree on the approach\n- [ ] Works on phones\n- [ ] Covered by a test in \`test/\`\n\n## Notes\n\nKeep the change small. Link the pull request here when it is up.`,
      is_locked: false,
    }
  })

const repo = (name: string, seeds: ReadonlyArray<Seed>, archived = false): FakeRepo => ({
  name,
  private: true,
  archived,
  writers: ["ada", "grace", "alan"],
  triagers: ["katherine"],
  labels: [],
  issues: issuesOf(name, seeds),
  failIssueListing: false,
})

const repos = [
  repo("api", [
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
    { title: "Drop the v0 token endpoint", labels: [L.chore, L.low], updated: 12 },
    {
      title: "Document the error codes",
      labels: [L.docs],
      assignees: [katherine],
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
      updated: 4,
      closed: 3,
      assignees: [alan],
    },
  ]),
  repo("web", [
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
  ]),
  repo("mobile", [
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
      updated: 4,
      closed: 2,
    },
    { title: "Haptic feedback on drop", labels: [L.ux, L.low], updated: 15 },
  ]),
  repo(
    "legacy-portal",
    [
      { title: "Sunset notice banner", labels: [L.chore], updated: 40 },
      { title: "Export old reports as CSV", labels: [L.progress, L.feature], updated: 30 },
    ],
    true,
  ),
]

const openIssues = repos
  .filter((candidate) => !candidate.archived)
  .flatMap((candidate) => candidate.issues.filter((issue) => issue.state === "open"))
const assignedToAda = openIssues.filter((issue) =>
  (issue.assignees ?? []).some((assignee) => assignee.login === "ada"),
)
const reviewPulls = [
  {
    title: "Add rate limiting to the public search endpoint",
    repo: "api",
    number: 41,
    from: grace,
  },
  { title: "Cache organization labels for a minute", repo: "api", number: 44, from: alan },
  { title: "Keyboard shortcuts for the board", repo: "web", number: 23, from: katherine },
].map(({ title, repo: name, number, from }, index) => ({
  number,
  title,
  html_url: `${ORIGIN}/acme/${name}/pulls/${number}`,
  state: "open",
  labels: index === 0 ? [L.feature, L.security] : index === 1 ? [L.perf] : [L.feature, L.ux],
  user: { id: from.id, login: from.login },
  updated_at: ago(0.1 + index * 0.6),
  comments: 2 + index * 3,
  repository: { id: 100, name, owner: "acme", full_name: `acme/${name}` },
  pull_request: { merged: false, draft: false, html_url: "" },
}))
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
  const letter = name.slice(0, 1).toUpperCase()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}"/><text x="32" y="42" font-family="system-ui,sans-serif" font-size="30" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text></svg>`
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
