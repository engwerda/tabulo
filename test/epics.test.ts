import { env } from "cloudflare:workers"
import { Schema } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { Epics } from "../src/shared/api.ts"
import { createFakeClock } from "./fake-clock.ts"
import { createFakeForgejo, type FakeForgejoFixtures } from "./fake-forgejo.ts"
import {
  acme,
  boardIssue,
  boardRepo,
  epicLabel,
  grace,
  inProgress,
  repoLabel,
  review,
} from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
    env.DB.prepare("DELETE FROM card_ranks"),
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
    expect(data.failedRepos).toEqual([{ repo: "broken", message: "Forgejo returned HTTP 500" }])
    expect(forgejo.requests.filter(({ path }) => path.endsWith("/issues/2"))).toHaveLength(0)
    expect(forgejo.requests.filter(({ path }) => path.endsWith("/issues/3"))).toHaveLength(1)
    expect(
      forgejo.requests.filter(({ method, path }) => path.startsWith("/api/") && method !== "GET"),
    ).toHaveLength(0)
    const rows = await env.DB.prepare("SELECT * FROM card_ranks").all()
    expect(rows.results).toHaveLength(0)
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
    expect(forgejo.requests.filter(({ path }) => path.includes("/external/issues/"))).toHaveLength(
      200,
    )
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
