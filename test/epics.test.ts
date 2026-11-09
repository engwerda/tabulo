import { env } from "cloudflare:workers"
import { Schema } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { Epics } from "../src/shared/api.ts"
import { createFakeClock } from "./fake-clock.ts"
import {
  createFakeForgejo,
  type FakeForgejoFixtures,
  type FakeIssue,
  type FakeTimelineEvent,
} from "./fake-forgejo.ts"
import {
  acme,
  boardIssue,
  boardRepo,
  epicLabel,
  grace,
  inProgress,
  label,
  referencedBy,
  repoLabel,
  review,
} from "./fixtures.ts"
import { postJson, signIn, tabulo } from "./harness.ts"

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
    env.DB.prepare("DELETE FROM card_ranks"),
    env.DB.prepare("DELETE FROM boards"),
  ])
})

const epicOrg = () =>
  acme([
    boardRepo("api", {
      issues: [
        boardIssue("api", 1, {
          title: "Ship the platform",
          labels: [epicLabel, inProgress],
          body: "- [x] #2\n- [ ] #3\n- [ ] web#4\n- [ ] partners/sdk#5\n- [ ] #6\n- [ ] hidden#7\n- [ ] forbidden#8\n- [x] #2",
          assignees: [grace],
          milestone: { id: 1, title: "v1", state: "open" },
        }),
        boardIssue("api", 2, { labels: [repoLabel("api", 101, inProgress.name, "aaaaaa", false)] }),
        boardIssue("api", 3, {
          state: "closed",
          closed_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        }),
        boardIssue("api", 6, {
          title: "Release PR",
          pull_request: { merged: false, draft: false, html_url: "" },
        }),
        boardIssue("api", 10, {
          labels: [epicLabel],
          state: "closed",
          closed_at: "2026-11-05T00:00:00Z",
          updated_at: "2026-11-05T00:00:00Z",
        }),
        boardIssue("api", 11, {
          labels: [epicLabel],
          state: "closed",
          closed_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-11-06T00:00:00Z",
        }),
        boardIssue("api", 12, { labels: [epicLabel], body: null }),
        boardIssue("api", 13, {
          labels: [epicLabel],
          pull_request: { merged: false, draft: false, html_url: "" },
        }),
      ],
    }),
    boardRepo("web", { issues: [boardIssue("web", 4, { labels: [review] })] }),
    boardRepo("broken", { failIssueListing: true }),
  ])

const fixtures = (): Partial<FakeForgejoFixtures> => ({
  orgs: [
    epicOrg(),
    {
      ...acme([
        boardRepo("sdk", {
          issues: [
            boardIssue("sdk", 5, {
              repository: { id: 100, name: "sdk", owner: "partners", full_name: "partners/sdk" },
            }),
          ],
        }),
      ]),
      name: "partners",
    },
  ],
  intercept: (_, path) =>
    path.includes("/forbidden/") ? new Response(null, { status: 403 }) : undefined,
})

// Requests that take a page from the budget: organization labels, listings, epic timelines, and
// child lookups.
const PAGE_READ = /\/labels$|\/issues(\/\d+)?$|\/timeline$/

const TOO_MANY_PAGES = {
  error: "Too many Forgejo pages for one request; choose fewer repositories",
}

/** Plain labels that fill an organization's label list up to `count`. */
const filler = (count: number) =>
  Array.from({ length: count }, (_, i) => label(1000 + i, `Area/${i}`, "ededed", false))

/** Twenty repositories of `open` and `closed` issues; r0#1 is an epic with 200 external children. */
const crowdedOrg = (open: number, closed: number) => {
  const names = Array.from({ length: 20 }, (_, i) => `r${i}`)
  const repos = names.map((name) =>
    boardRepo(name, {
      issues: Array.from({ length: open + closed }, (_, i) =>
        boardIssue(
          name,
          i + 1,
          i < open
            ? {}
            : {
                state: "closed",
                closed_at: "2026-11-01T00:00:00Z",
                updated_at: "2026-11-01T00:00:00Z",
              },
        ),
      ),
    }),
  )
  const epic = repos[0]?.issues[0]
  if (epic !== undefined) {
    epic.labels = [epicLabel]
    epic.body = Array.from({ length: 200 }, (_, i) => `- [ ] external#${i + 1}`).join("\n")
  }
  return { names, org: acme(repos) }
}

describe("GET /api/epics", () => {
  it("decodes epic bodies separately and resolves children from real state and board columns", async () => {
    const forgejo = createFakeForgejo({ ...fixtures(), maxPageSize: 2 })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=ACME&repos=api,api,broken", { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    expect(data.org).toBe("acme")
    expect(data.repos).toEqual(["api", "broken"])
    expect(data.epics.map(({ number }) => number)).toEqual([1, 12, 10])
    const epic = data.epics[0]
    expect(epic).toMatchObject({
      key: "acme/api#1",
      repo: "api",
      column: inProgress.name,
      milestone: "v1",
      assignees: [{ login: "grace", avatarUrl: grace.avatar_url }],
      labels: [{ name: "Type/Epic" }],
      progress: {
        total: 7,
        done: 1,
        byColumn: {
          todo: 2,
          "Status/Backlog": 0,
          "Status/In Progress": 1,
          "Status/Review": 1,
          done: 1,
        },
      },
    })
    expect(epic?.children).toEqual([
      expect.objectContaining({
        _tag: "Issue",
        key: "acme/api#2",
        column: inProgress.name,
        state: "open",
        kind: "issue",
      }),
      expect.objectContaining({
        _tag: "Issue",
        key: "acme/api#3",
        column: "done",
        state: "closed",
      }),
      expect.objectContaining({
        _tag: "Issue",
        key: "acme/web#4",
        repo: "acme/web",
        column: review.name,
      }),
      expect.objectContaining({
        _tag: "Issue",
        key: "partners/sdk#5",
        repo: "partners/sdk",
        column: "todo",
      }),
      expect.objectContaining({ _tag: "Issue", key: "acme/api#6", kind: "pull", column: "todo" }),
      { _tag: "Unavailable", ref: "acme/hidden#7" },
      { _tag: "Unavailable", ref: "acme/forbidden#8" },
    ])
    expect(data.epics.find(({ number }) => number === 12)?.progress.total).toBe(0)
    expect(data.failedRepos).toEqual([
      { repo: "broken", message: "Forgejo had a problem (HTTP 500); try again in a moment" },
    ])
    expect(data.incomplete).toEqual({ listings: [], children: 0, backlinks: [] })
    expect(forgejo.requests.filter(({ path }) => path.endsWith("/issues/2"))).toHaveLength(0)
    expect(forgejo.requests.filter(({ path }) => path.endsWith("/issues/3"))).toHaveLength(1)
    expect(
      forgejo.requests.filter(({ method, path }) => path.startsWith("/api/") && method !== "GET"),
    ).toHaveLength(0)
    const rows = await env.DB.prepare("SELECT * FROM card_ranks").all()
    expect(rows.results).toHaveLength(0)
  })

  it("orders columns as the stored default board does and counts its hidden columns", async () => {
    const forgejo = createFakeForgejo({ ...fixtures(), maxPageSize: 2 })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const stored = await postJson(call, cookie, "/api/boards/update", {
      org: "acme",
      board: "default",
      version: 0,
      name: "Board",
      repos: ["api"],
      columns: ["done", review.name, "todo"],
      hidden: [inProgress.name, "todo"],
      dropUnreadable: false,
    })
    expect(stored.status).toBe(200)

    const response = await call("/api/epics?org=acme&repos=api,web", { headers: { cookie } })

    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    expect(data.columns.map(({ key }) => key)).toEqual([
      "Status/Backlog",
      inProgress.name,
      "done",
      review.name,
      "todo",
    ])
    expect(data.epics[0]?.progress).toEqual({
      total: 7,
      done: 1,
      byColumn: {
        "Status/Backlog": 0,
        "Status/In Progress": 1,
        done: 1,
        "Status/Review": 1,
        todo: 2,
      },
    })
  })

  it("reuses children already listed in another chosen repository and across epics", async () => {
    const org = epicOrg()
    org.repos[0]?.issues.push(
      boardIssue("api", 20, { labels: [epicLabel], body: "- [ ] web#4\n- [ ] partners/sdk#5" }),
    )
    const forgejo = createFakeForgejo({
      ...fixtures(),
      orgs: [org, ...(fixtures().orgs ?? []).slice(1)],
    })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=acme&repos=api,web", { headers: { cookie } })
    expect(response.status).toBe(200)
    expect(forgejo.requests.filter(({ path }) => path.endsWith("/web/issues/4"))).toHaveLength(0)
    expect(forgejo.requests.filter(({ path }) => path.endsWith("/sdk/issues/5"))).toHaveLength(1)
  })

  it("names child repositories as Forgejo spells them", async () => {
    const repository = (name: string) => ({
      id: 100,
      name,
      owner: "acme",
      full_name: `acme/${name}`,
    })
    const forgejo = createFakeForgejo({
      orgs: [
        acme([
          boardRepo("api", {
            issues: [
              boardIssue("api", 1, { labels: [epicLabel], body: "- [ ] web#4\n- [ ] docs#5" }),
            ],
          }),
          boardRepo("Web", { issues: [boardIssue("Web", 4, { repository: repository("Web") })] }),
          boardRepo("Docs", {
            issues: [boardIssue("Docs", 5, { repository: repository("Docs") })],
          }),
        ]),
      ],
    })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=acme&repos=api,Docs", { headers: { cookie } })
    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    expect(data.epics[0]?.children).toEqual([
      expect.objectContaining({ key: "acme/web#4", repo: "acme/Web" }),
      expect.objectContaining({ key: "acme/docs#5", repo: "acme/Docs" }),
    ])
  })

  it("honors a custom epic label and Done window", async () => {
    const forgejo = createFakeForgejo({ orgs: [epicOrg()] })
    const call = tabulo(forgejo.fetch, {
      clock: createFakeClock().clock,
      vars: { EPIC_LABEL: inProgress.name, BOARD_DONE_DAYS: "1" },
    })
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=acme&repos=api", { headers: { cookie } })
    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    expect(data.epics.map(({ number }) => number)).toEqual([1, 2])
  })

  it("returns an empty successful payload when there are no epics", async () => {
    const forgejo = createFakeForgejo({ orgs: [acme([boardRepo("api")])] })
    const call = tabulo(forgejo.fetch)
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=acme&repos=api", { headers: { cookie } })
    expect(Schema.decodeUnknownSync(Epics)(await response.json()).epics).toEqual([])
  })

  it.each([
    "org=acme",
    "org=../acme&repos=api",
    "org=acme&repos=../api",
    `org=acme&repos=${Array.from({ length: 21 }, (_, i) => `repo${i}`).join(",")}`,
  ])("rejects invalid scope %s", async (query) => {
    const response = await tabulo(createFakeForgejo().fetch)(`/api/epics?${query}`)
    expect(response.status).toBe(400)
  })

  it("requires a session", async () => {
    expect((await tabulo(createFakeForgejo().fetch)("/api/epics?org=acme&repos=api")).status).toBe(
      401,
    )
  })

  it.each([401, 500])("propagates child HTTP %s rather than hiding the failure", async (status) => {
    const forgejo = createFakeForgejo({
      ...fixtures(),
      intercept: (_, path) =>
        path.endsWith("/api/issues/3") ? new Response(null, { status }) : undefined,
    })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=acme&repos=api", { headers: { cookie } })
    expect(response.status).toBe(status === 401 ? 401 : 502)
  })

  it("caps unique individual lookups across all epics and keeps overflow references", async () => {
    const org = acme([
      boardRepo("api", {
        issues: [1, 2].map((number) =>
          boardIssue("api", number, {
            labels: [epicLabel],
            body: Array.from(
              { length: 200 },
              (_, i) => `- [ ] external#${i + 1 + (number - 1) * 200}`,
            ).join("\n"),
          }),
        ),
      }),
    ])
    const forgejo = createFakeForgejo({ orgs: [org] })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=acme&repos=api", { headers: { cookie } })
    expect(response.status).toBe(200)
    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    expect(data.epics.map(({ children }) => children.length)).toEqual([200, 200])
    expect(data.epics[1]?.children.at(-1)).toEqual({
      _tag: "Unavailable",
      ref: "acme/external#400",
    })
    expect(data.incomplete).toEqual({ listings: [], children: 200, backlinks: [] })
    expect(forgejo.requests.filter(({ path }) => path.includes("/external/issues/"))).toHaveLength(
      200,
    )
  })

  it("reads a repository past 100 pages", async () => {
    const issues = Array.from({ length: 300 }, (_, i) =>
      boardIssue("api", i + 1, i === 250 ? { labels: [epicLabel] } : {}),
    )
    const forgejo = createFakeForgejo({
      orgs: [acme([boardRepo("api", { issues })])],
      maxPageSize: 2,
    })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const response = await call("/api/epics?org=acme&repos=api", { headers: { cookie } })
    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    expect(data.epics.map(({ number }) => number)).toEqual([251])
    expect(data.incomplete).toEqual({ listings: [], children: 0, backlinks: [] })
  })

  it("stays within the Worker's subrequest limit and says what it did not read", async () => {
    const { names, org } = crowdedOrg(60, 60)
    const forgejo = createFakeForgejo({ orgs: [org], maxPageSize: 2 })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const before = forgejo.requests.length

    const response = await call(`/api/epics?org=acme&repos=${names.join(",")}`, {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    const reads = forgejo.requests.slice(before)
    expect(reads.length).toBeLessThan(1000)
    // Labels, listings, timelines, and child lookups share 800 pages; each repository also
    // reads itself.
    expect(reads.filter(({ path }) => PAGE_READ.test(path))).toHaveLength(800)
    // Each repository needs 60 listing pages, more than its share of 800.
    expect(data.incomplete.listings).toHaveLength(40)
    expect(data.incomplete.listings).toContainEqual({ repo: "r0", listing: "closed" })
    expect(data.incomplete.children).toBe(200)
    expect(data.incomplete.backlinks, "the listings leave no page for r0#1's timeline").toEqual([
      { repo: "r0", number: 1 },
    ])
    expect(data.epics.map(({ key }) => key)).toEqual(["acme/r0#1"])
    expect(data.epics[0]?.children).toHaveLength(200)
    expect(data.epics[0]?.children.every(({ _tag }) => _tag === "Unavailable")).toBe(true)
  })

  it.each([
    // 600 of the 800 pages go to listings before Forgejo rejects the token.
    { read: "listing", closed: 60, rejects: /^\/api\/v1\/repos\/acme\/r\d+\/issues$/, at: 600 },
    // Labels and listings take 623 pages, leaving one for the timeline and 176 child lookups;
    // the 150th lookup is rejected.
    { read: "child lookup", closed: 0, rejects: /\/external\/issues\//, at: 150 },
    // The first attempt rejects r0#1's timeline once labels and listings have taken 623 pages.
    { read: "timeline", closed: 0, rejects: /\/timeline$/, at: 1 },
  ])("keeps one page budget when a late $read 401 refreshes the token", async (scenario) => {
    const { names, org } = crowdedOrg(60, scenario.closed)
    let matched = 0
    const forgejo = createFakeForgejo({
      orgs: [org],
      maxPageSize: 2,
      intercept: (_, path) =>
        scenario.rejects.test(path) && ++matched === scenario.at
          ? new Response(null, { status: 401 })
          : undefined,
    })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)
    const before = forgejo.requests.length

    const response = await call(`/api/epics?org=acme&repos=${names.join(",")}`, {
      headers: { cookie },
    })

    expect(response.status).toBe(200)
    const reads = forgejo.requests.slice(before)
    expect(reads.filter(({ path }) => path === "/login/oauth/access_token")).toHaveLength(1)
    expect(reads.filter(({ path }) => PAGE_READ.test(path)).length).toBeLessThanOrEqual(800)
    expect(reads.length).toBeLessThan(1000)
  })

  it.each([
    // Labels take 100 of the 800 pages, so listings stop at 700 and the 780th never runs.
    { at: 780, status: 200, refreshes: 0 },
    // The retry reads the 100 label pages again from the 400 the first attempt left.
    { at: 300, status: 200, refreshes: 1 },
    // About 50 pages are left after the 650th listing read, too few to read the labels again.
    { at: 650, status: 503, refreshes: 1 },
  ])(
    "reads 200 labels from the same pages on each attempt (401 at listing $at)",
    async (scenario) => {
      const { names, org } = crowdedOrg(60, 60)
      org.labels = [...org.labels, ...filler(200 - org.labels.length)]
      let matched = 0
      const forgejo = createFakeForgejo({
        orgs: [org],
        maxPageSize: 2,
        intercept: (_, path) =>
          /^\/api\/v1\/repos\/acme\/r\d+\/issues$/.test(path) && ++matched === scenario.at
            ? new Response(null, { status: 401 })
            : undefined,
      })
      const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
      const cookie = await signIn(call, forgejo)
      const before = forgejo.requests.length

      const response = await call(`/api/epics?org=acme&repos=${names.join(",")}`, {
        headers: { cookie },
      })

      expect(response.status).toBe(scenario.status)
      if (scenario.status === 503) expect(await response.json()).toEqual(TOO_MANY_PAGES)
      const reads = forgejo.requests.slice(before)
      expect(reads.filter(({ path }) => path === "/login/oauth/access_token")).toHaveLength(
        scenario.refreshes,
      )
      expect(reads.filter(({ path }) => PAGE_READ.test(path)).length).toBeLessThanOrEqual(800)
      expect(reads.length).toBeLessThan(1000)
    },
  )

  it("places an epic by a status label past the hundredth page of labels", async () => {
    const late = label(999, "Status/Late", "e99695", true)
    const org = acme([
      boardRepo("api", { issues: [boardIssue("api", 1, { labels: [epicLabel, late] })] }),
    ])
    org.labels = [...org.labels, ...filler(200 - org.labels.length), late]
    const forgejo = createFakeForgejo({ orgs: [org], maxPageSize: 2 })
    const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
    const cookie = await signIn(call, forgejo)

    const response = await call("/api/epics?org=acme&repos=api", { headers: { cookie } })

    expect(response.status).toBe(200)
    const data = Schema.decodeUnknownSync(Epics)(await response.json())
    expect(data.epics.map(({ column }) => column)).toEqual(["Status/Late"])
  })

  it("bounds concurrent child reads to four", async () => {
    const forgejo = createFakeForgejo({
      orgs: [
        acme([
          boardRepo("api", {
            issues: [
              boardIssue("api", 1, {
                labels: [epicLabel],
                body: Array.from({ length: 6 }, (_, i) => `- [ ] external#${i + 1}`).join("\n"),
              }),
            ],
          }),
        ]),
      ],
    })
    let active = 0
    let peak = 0
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const call = tabulo(
      async (request) => {
        if (!request.url.includes("/external/issues/")) return forgejo.fetch(request)
        active++
        peak = Math.max(peak, active)
        if (active === 4) release()
        await gate
        const response = await forgejo.fetch(request)
        active--
        return response
      },
      { clock: createFakeClock().clock },
    )
    const cookie = await signIn(call, forgejo)
    expect((await call("/api/epics?org=acme&repos=api", { headers: { cookie } })).status).toBe(200)
    expect(peak).toBe(4)
  })
})

const LABELLED: FakeTimelineEvent = { type: "label" }

/** An organization whose api repository holds `issues`, beside more repositories. */
const linkedOrg = (issues: Array<FakeIssue>, ...repos: Array<ReturnType<typeof boardRepo>>) =>
  acme([boardRepo("api", { issues }), ...repos])

const loadEpicsOf = async (
  overrides: Partial<FakeForgejoFixtures>,
  repos = "api",
): Promise<{ data: typeof Epics.Type; forgejo: ReturnType<typeof createFakeForgejo> }> => {
  const forgejo = createFakeForgejo(overrides)
  const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
  const cookie = await signIn(call, forgejo)
  const response = await call(`/api/epics?org=acme&repos=${repos}`, { headers: { cookie } })
  expect(response.status, "the epics request succeeds").toBe(200)
  return { data: Schema.decodeUnknownSync(Epics)(await response.json()), forgejo }
}

const childKeys = (epic: (typeof Epics.Type)["epics"][number] | undefined) =>
  epic?.children.map((child) => (child._tag === "Issue" ? child.key : child.ref))

const timelineReads = (forgejo: ReturnType<typeof createFakeForgejo>, epic: string) =>
  forgejo.requests.filter(({ path }) => path === `/api/v1/repos/acme/${epic}/timeline`)

describe("GET /api/epics, children that name their epic", () => {
  it("finds them through the epic's timeline, judged by each one's current description", async () => {
    const inProgressChild = boardIssue("api", 20, {
      body: "Part of #1",
      labels: [inProgress],
      created_at: "2026-04-01T00:00:00Z",
    })
    const closedLongAgo = boardIssue("api", 21, {
      body: "## Parent\n\n#1",
      state: "closed",
      created_at: "2026-04-02T00:00:00Z",
      closed_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    })
    const unchosenRepo = boardIssue("web", 22, {
      body: "Part of acme/api#1",
      created_at: "2026-04-03T00:00:00Z",
    })
    const ownParent = boardIssue("web", 25, {
      body: "Part of #1. See acme/api#1 for the data.",
      created_at: "2026-04-04T00:00:00Z",
    })
    const otherOwner: FakeIssue = {
      ...boardIssue("tools", 7, { body: "Part of acme/api#1", created_at: "2026-04-05T00:00:00Z" }),
      html_url: "https://forgejo.example/umbrella/tools/issues/7",
      repository: { id: 300, name: "tools", owner: "umbrella", full_name: "umbrella/tools" },
    }
    const editedAway = boardIssue("api", 23, {
      body: "Related to #1",
      created_at: "2026-03-01T00:00:00Z",
    })
    const pull = boardIssue("api", 24, {
      body: "Part of #1",
      created_at: "2026-03-01T00:00:00Z",
      pull_request: { merged: false, draft: false, html_url: "" },
    })
    const epic = boardIssue("api", 1, {
      labels: [epicLabel],
      timeline: referencedBy(
        unchosenRepo,
        editedAway,
        pull,
        closedLongAgo,
        inProgressChild,
        ownParent,
        otherOwner,
      ),
    })

    const { data, forgejo } = await loadEpicsOf({
      orgs: [
        linkedOrg(
          [epic, inProgressChild, closedLongAgo, editedAway, pull],
          boardRepo("web", { issues: [unchosenRepo, ownParent] }),
        ),
        {
          ...acme([boardRepo("tools", { issues: [otherOwner] })]),
          name: "umbrella",
          full_name: "Umbrella",
        },
      ],
    })

    expect(data.epics[0]?.children).toEqual([
      expect.objectContaining({ key: "acme/api#20", column: inProgress.name, kind: "issue" }),
      expect.objectContaining({ key: "acme/api#21", column: "done", state: "closed" }),
      expect.objectContaining({ key: "acme/web#22", repo: "acme/web", column: "todo" }),
      expect.objectContaining({ key: "umbrella/tools#7", repo: "umbrella/tools" }),
    ])
    expect(data.epics[0]?.progress).toMatchObject({ total: 4, done: 1 })
    expect(
      forgejo.requests.filter(({ path }) => /\/issues\/2\d$/.test(path)),
      "linked children come with the timeline, so none is looked up",
    ).toHaveLength(0)
  })

  it("lists body children first, then linked children oldest first with the key breaking ties", async () => {
    const naming = (number: number, created: string) =>
      boardIssue("api", number, { body: "Part of #1", created_at: created })
    const both = naming(31, "2026-10-05T00:00:00Z")
    const second = naming(33, "2026-10-03T00:00:00Z")
    const first = naming(32, "2026-10-02T00:00:00Z")
    const tieLater = naming(35, "2026-10-04T00:00:00Z")
    const tieEarlier = naming(34, "2026-10-04T00:00:00Z")
    const epic = boardIssue("api", 1, {
      labels: [epicLabel],
      body: "- #30\n- #31",
      timeline: referencedBy(both, second, tieLater, first, tieEarlier, both),
    })

    const { data } = await loadEpicsOf({
      orgs: [linkedOrg([epic, boardIssue("api", 30), both, second, first, tieLater, tieEarlier])],
    })

    expect(childKeys(data.epics[0])).toEqual([
      "acme/api#30",
      "acme/api#31",
      "acme/api#32",
      "acme/api#33",
      "acme/api#34",
      "acme/api#35",
    ])
  })

  it("reads past a timeline page that Forgejo shortened by dropping an unreadable reference", async () => {
    const hidden = boardIssue("secret", 9, { body: "Part of acme/api#1" })
    const late = boardIssue("api", 50, { body: "Part of #1" })
    const epic = boardIssue("api", 1, {
      labels: [epicLabel],
      timeline: [LABELLED, LABELLED, LABELLED, ...referencedBy(hidden, late)],
    })

    const { data, forgejo } = await loadEpicsOf({
      orgs: [
        linkedOrg([epic, late], boardRepo("secret", { hiddenFrom: ["ada"], issues: [hidden] })),
      ],
      maxPageSize: 2,
    })

    expect(childKeys(data.epics[0])).toEqual(["acme/api#50"])
    expect(
      timelineReads(forgejo, "api/issues/1"),
      "pages 1 to 3, where page 2 is short, and the empty page 4",
    ).toHaveLength(4)
  })

  it("reads a timeline whose X-Total-Count is the length of each page", async () => {
    const child = boardIssue("api", 60, { body: "Part of #1" })
    const epic = boardIssue("api", 1, {
      labels: [epicLabel],
      timeline: [
        ...Array.from({ length: 59 }, () => LABELLED),
        ...referencedBy(child),
        ...Array.from({ length: 13 }, () => LABELLED),
      ],
    })

    const { data, forgejo } = await loadEpicsOf({ orgs: [linkedOrg([epic, child])] })

    expect(childKeys(data.epics[0])).toEqual(["acme/api#60"])
    expect(
      timelineReads(forgejo, "api/issues/1"),
      "50 and 23 events, then the empty page",
    ).toHaveLength(3)
  })

  it("resolves a listed child from another epic's timeline without looking it up", async () => {
    const external = boardIssue("other", 5, { body: "Uses api#2 for its data." })
    const lister = boardIssue("api", 1, { labels: [epicLabel], body: "- [ ] other#5" })
    const referenced = boardIssue("api", 2, {
      labels: [epicLabel],
      timeline: referencedBy(external),
    })

    const { data, forgejo } = await loadEpicsOf({
      orgs: [linkedOrg([lister, referenced], boardRepo("other", { issues: [external] }))],
    })

    expect(data.epics.find(({ number }) => number === 1)?.children).toEqual([
      expect.objectContaining({ _tag: "Issue", key: "acme/other#5", repo: "acme/other" }),
    ])
    expect(childKeys(data.epics.find(({ number }) => number === 2))).toEqual([])
    expect(forgejo.requests.filter(({ path }) => path.endsWith("/other/issues/5"))).toHaveLength(0)
  })

  it("reads epic timelines before child lookups within the page budget", async () => {
    const { names, org } = crowdedOrg(60, 0)

    const { data, forgejo } = await loadEpicsOf({ orgs: [org], maxPageSize: 2 }, names.join(","))

    // Labels take 3 pages, and each of 20 repositories 30 open pages and one empty closed page.
    // That leaves 177 of 800: one for r0#1's empty timeline, then 176 lookups.
    expect(timelineReads(forgejo, "r0/issues/1")).toHaveLength(1)
    expect(forgejo.requests.filter(({ path }) => path.includes("/external/issues/"))).toHaveLength(
      176,
    )
    expect(data.incomplete.children).toBe(24)
  })

  it.each([403, 404])(
    "names an epic whose timeline answers HTTP %s and keeps its listed children",
    async (status) => {
      const unread = boardIssue("api", 1, { labels: [epicLabel], body: "- #2" })
      const read = boardIssue("api", 3, { labels: [epicLabel] })

      const { data } = await loadEpicsOf({
        orgs: [linkedOrg([unread, boardIssue("api", 2), read])],
        intercept: (_, path) =>
          path.endsWith("/acme/api/issues/1/timeline") ? new Response(null, { status }) : undefined,
      })

      expect(childKeys(data.epics.find(({ number }) => number === 1))).toEqual(["acme/api#2"])
      expect(data.incomplete.backlinks).toEqual([{ repo: "api", number: 1 }])
    },
  )

  it.each([
    ["answers HTTP 500", () => new Response(null, { status: 500 })],
    ["sends an event Tabulo cannot decode", () => Response.json([{ type: 7 }])],
  ])("names an epic whose timeline %s and keeps the other epics", async (_, failure) => {
    const failing = boardIssue("api", 1, { labels: [epicLabel], body: "- #2" })
    const child = boardIssue("api", 4, { body: "Part of #3" })
    const read = boardIssue("api", 3, { labels: [epicLabel], timeline: referencedBy(child) })

    const { data } = await loadEpicsOf({
      orgs: [linkedOrg([failing, boardIssue("api", 2), read, child])],
      intercept: (_, path) =>
        path.endsWith("/acme/api/issues/1/timeline") ? failure() : undefined,
    })

    expect(childKeys(data.epics.find(({ number }) => number === 1))).toEqual(["acme/api#2"])
    expect(childKeys(data.epics.find(({ number }) => number === 3))).toEqual(["acme/api#4"])
    expect(data.incomplete.backlinks).toEqual([{ repo: "api", number: 1 }])
  })

  it("stops a timeline at 20 pages and names its epic, leaving pages for the rest", async () => {
    const late = boardIssue("api", 60, { body: "Part of #1" })
    const huge = boardIssue("api", 1, {
      labels: [epicLabel],
      timeline: [...Array.from({ length: 48 }, () => LABELLED), ...referencedBy(late)],
    })
    const child = boardIssue("api", 4, { body: "Part of #3" })
    const small = boardIssue("api", 3, { labels: [epicLabel], timeline: referencedBy(child) })

    const { data, forgejo } = await loadEpicsOf({
      orgs: [linkedOrg([huge, late, small, child])],
      maxPageSize: 2,
    })

    expect(timelineReads(forgejo, "api/issues/1")).toHaveLength(20)
    expect(childKeys(data.epics.find(({ number }) => number === 1))).toEqual([])
    expect(childKeys(data.epics.find(({ number }) => number === 3))).toEqual(["acme/api#4"])
    expect(data.incomplete.backlinks).toEqual([{ repo: "api", number: 1 }])
  })

  it("does not count the parent a sub-epic names in its own description", async () => {
    const sub = boardIssue("api", 110, {
      labels: [epicLabel],
      body: "## Parent\n\n- #100\n\n## Tasks\n\n- [ ] #111",
    })
    const parent = boardIssue("api", 100, { labels: [epicLabel], timeline: referencedBy(sub) })

    const { data } = await loadEpicsOf({
      orgs: [linkedOrg([parent, sub, boardIssue("api", 111)])],
    })

    expect(childKeys(data.epics.find(({ number }) => number === 110))).toEqual(["acme/api#111"])
    expect(childKeys(data.epics.find(({ number }) => number === 100))).toEqual(["acme/api#110"])
  })

  it("bounds concurrent timeline reads to four", async () => {
    const forgejo = createFakeForgejo({
      orgs: [
        linkedOrg(
          Array.from({ length: 6 }, (_, i) => boardIssue("api", i + 1, { labels: [epicLabel] })),
        ),
      ],
    })
    let active = 0
    let peak = 0
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const call = tabulo(
      async (request) => {
        if (!request.url.includes("/timeline")) return forgejo.fetch(request)
        active++
        peak = Math.max(peak, active)
        if (active === 4) release()
        await gate
        const response = await forgejo.fetch(request)
        active--
        return response
      },
      { clock: createFakeClock().clock },
    )
    const cookie = await signIn(call, forgejo)
    expect((await call("/api/epics?org=acme&repos=api", { headers: { cookie } })).status).toBe(200)
    expect(peak).toBe(4)
  })
})
