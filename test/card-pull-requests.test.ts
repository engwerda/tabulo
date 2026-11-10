import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { createFakeClock } from "./fake-clock.ts"
import {
  createFakeForgejo,
  type FakeForgejoFixtures,
  type FakeIssue,
  type FakeOrg,
  type FakeTimelineEvent,
} from "./fake-forgejo.ts"
import { acme, boardIssue, boardRepo, grace, outsider } from "./fixtures.ts"
import { signIn, tabulo } from "./harness.ts"

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM oauth_states"),
  ])
})

type PullState = "open" | "draft" | "merged" | "closed"
type Action = NonNullable<Extract<FakeTimelineEvent, { from: unknown }>["action"]>

const pull = (repo: string, number: number, state: PullState, owner = "acme"): FakeIssue => {
  const html_url = `https://forgejo.example/${owner}/${repo}/pulls/${number}`
  const ended = state === "merged" || state === "closed"
  return boardIssue(repo, number, {
    title: `Pull ${number} in ${repo}`,
    html_url,
    state: ended ? "closed" : "open",
    closed_at: ended ? "2026-11-05T10:00:00Z" : null,
    pull_request: {
      merged: state === "merged",
      merged_at: state === "merged" ? "2026-11-05T10:00:00Z" : null,
      draft: state === "draft",
      html_url,
    },
    repository: { id: 200, name: repo, owner, full_name: `${owner}/${repo}` },
  })
}

/** The event Forgejo records when `from`'s title or description references the issue. */
const reference = (from: FakeIssue, action?: Action): FakeTimelineEvent => ({
  type: from.pull_request === null ? "issue_ref" : "pull_ref",
  from: { owner: from.repository.owner, repo: from.repository.name, number: from.number },
  ...(action === undefined ? {} : { action }),
})

const LABELLED: FakeTimelineEvent = { type: "label" }

/** acme/api#1, whose timeline holds `timeline`, beside the issues and pull requests it names. */
const cardOrgs = (
  timeline: ReadonlyArray<FakeTimelineEvent>,
  api: Array<FakeIssue>,
  more: { web?: Array<FakeIssue>; hidden?: Array<FakeIssue>; sdk?: Array<FakeIssue> } = {},
): Array<FakeOrg> => [
  acme([
    boardRepo("api", { issues: [boardIssue("api", 1, { timeline }), ...api] }),
    boardRepo("web", { issues: more.web ?? [] }),
    boardRepo("hidden", { issues: more.hidden ?? [], hiddenFrom: ["ada", "linus"] }),
  ]),
  {
    name: "partners",
    full_name: "Partners",
    avatar_url: "https://forgejo.example/avatars/partners",
    members: ["grace"],
    labels: [],
    repos: [boardRepo("sdk", { private: false, issues: more.sdk ?? [] })],
  },
]

const PULLS = "/api/board/issue-pulls?org=acme&repo=api&number=1"

const session = async (overrides: Partial<FakeForgejoFixtures>) => {
  const forgejo = createFakeForgejo({ otherUsers: [grace, outsider], ...overrides })
  const call = tabulo(forgejo.fetch, { clock: createFakeClock().clock })
  const cookie = await signIn(call, forgejo)
  return { forgejo, call, cookie }
}

const pullsOf = async (orgs: Array<FakeOrg>, overrides: Partial<FakeForgejoFixtures> = {}) => {
  const { forgejo, call, cookie } = await session({ orgs, ...overrides })
  const response = await call(PULLS, { headers: { cookie } })
  expect(response.status, "the pull requests request succeeds").toBe(200)
  const body = (await response.json()) as {
    key: string
    pullRequests: Array<{ key: string; state: PullState; reference: string }>
    complete: boolean
  }
  return { body, forgejo }
}

const summary = (body: Awaited<ReturnType<typeof pullsOf>>["body"]) =>
  body.pullRequests.map(({ key, state, reference }) => `${key} ${state} ${reference}`)

describe("GET /api/board/issue-pulls", () => {
  it("answers each pull request with its state, open first, then draft, merged, and closed, to anyone who can read the issue", async () => {
    const closed = pull("api", 23, "closed")
    const merged = pull("api", 22, "merged")
    const sdk = pull("sdk", 3, "open", "partners")
    const web = pull("web", 5, "open")
    const draft = pull("api", 21, "draft")
    const openLater = pull("api", 20, "open")
    const openEarlier = pull("api", 9, "open")
    const orgs = cardOrgs(
      [
        reference(closed),
        reference(merged, "closes"),
        reference(sdk),
        reference(web, "closes"),
        reference(draft),
        reference(openLater, "closes"),
        reference(openEarlier),
      ],
      [closed, merged, draft, openLater, openEarlier],
      { web: [web], sdk: [sdk] },
    )
    const { forgejo, call, cookie } = await session({ orgs })
    const outsiderCookie = await signIn(call, forgejo, "linus")

    const member = await call(PULLS, { headers: { cookie } })
    const nonMember = await call(PULLS.replace("acme", "ACME"), {
      headers: { cookie: outsiderCookie },
    })

    const entry = (owner: string, repo: string, number: number, state: PullState) => ({
      key: `${owner}/${repo}#${number}`,
      repo: `${owner}/${repo}`,
      number,
      title: `Pull ${number} in ${repo}`,
      url: `https://forgejo.example/${owner}/${repo}/pulls/${number}`,
      state,
    })
    const expected = {
      key: "acme/api#1",
      pullRequests: [
        { ...entry("acme", "api", 9, "open"), reference: "mentions" },
        { ...entry("acme", "api", 20, "open"), reference: "closes" },
        { ...entry("acme", "web", 5, "open"), reference: "closes" },
        { ...entry("partners", "sdk", 3, "open"), reference: "mentions" },
        { ...entry("acme", "api", 21, "draft"), reference: "mentions" },
        { ...entry("acme", "api", 22, "merged"), reference: "closes" },
        { ...entry("acme", "api", 23, "closed"), reference: "mentions" },
      ],
      complete: true,
    }
    expect([member.status, nonMember.status], "members and others may ask").toEqual([200, 200])
    expect(await member.json()).toEqual(expected)
    expect(await nonMember.json(), "a non-member sees the same pull requests").toEqual(expected)
  })

  it("marks a pull request that uses a closing keyword in any of its references", async () => {
    const mentions = pull("api", 20, "open")
    const reopens = pull("api", 21, "open")
    const closesLater = pull("api", 22, "open")
    const closesFirst = pull("api", 23, "open")
    const { body } = await pullsOf(
      cardOrgs(
        [
          reference(mentions),
          reference(reopens, "reopens"),
          reference(closesLater),
          reference(closesLater, "closes"),
          reference(closesFirst, "closes"),
          reference(closesFirst),
        ],
        [mentions, reopens, closesLater, closesFirst],
      ),
    )

    expect(summary(body)).toEqual([
      "acme/api#20 open mentions",
      "acme/api#21 open mentions",
      "acme/api#22 open closes",
      "acme/api#23 open closes",
    ])
  })

  it("leaves out references that a later edit removed", async () => {
    const removed = pull("api", 20, "open")
    const closesAgain = pull("api", 21, "open")
    const nowMentions = pull("api", 22, "open")
    const { body } = await pullsOf(
      cardOrgs(
        [
          reference(removed, "neutered"),
          reference(closesAgain, "neutered"),
          reference(closesAgain, "closes"),
          reference(nowMentions, "neutered"),
          reference(nowMentions),
        ],
        [removed, closesAgain, nowMentions],
      ),
    )

    expect(summary(body), "a removed closing keyword does not count").toEqual([
      "acme/api#21 open closes",
      "acme/api#22 open mentions",
    ])
  })

  it("leaves out issues, comments, and pull requests the user cannot read", async () => {
    const listed = pull("api", 20, "open")
    const issue = boardIssue("api", 30)
    const commentedOn = pull("api", 28, "open")
    const unreadable = pull("hidden", 9, "open")
    const { body } = await pullsOf(
      cardOrgs(
        [
          reference(issue, "closes"),
          { type: "pull_ref", from: { owner: "acme", repo: "api", number: 30 } },
          { type: "comment_ref", from: { owner: "acme", repo: "api", number: 28 } },
          reference(unreadable, "closes"),
          reference(listed),
        ],
        [listed, issue, commentedOn],
        { hidden: [unreadable] },
      ),
    )

    expect(summary(body)).toEqual(["acme/api#20 open mentions"])
  })

  it("answers an empty list when the issue's timeline has no events", async () => {
    const { body, forgejo } = await pullsOf(cardOrgs([], []))

    expect(body).toEqual({ key: "acme/api#1", pullRequests: [], complete: true })
    expect(
      forgejo.requests.filter(({ path }) => path === "/api/v1/repos/acme/api/issues/1/timeline"),
      "the first page is Forgejo's null, which ends the timeline",
    ).toHaveLength(1)
  })

  it("stops at 20 timeline pages and says Forgejo may list more", async () => {
    const early = pull("api", 20, "open")
    const late = pull("api", 21, "open")
    const { body, forgejo } = await pullsOf(
      cardOrgs(
        [reference(early), ...Array.from({ length: 48 }, () => LABELLED), reference(late)],
        [early, late],
      ),
      { maxPageSize: 2 },
    )

    expect(
      forgejo.requests.filter(({ path }) => path === "/api/v1/repos/acme/api/issues/1/timeline"),
    ).toHaveLength(20)
    expect(summary(body), "the pages read still count").toEqual(["acme/api#20 open mentions"])
    expect(body.complete).toBe(false)
  })

  it.each([
    ["no number", 400, "/api/board/issue-pulls?org=acme&repo=api"],
    ["number zero", 400, "/api/board/issue-pulls?org=acme&repo=api&number=0"],
    ["a path in the repository", 400, "/api/board/issue-pulls?org=acme&repo=..&number=1"],
    ["an issue Forgejo does not have", 404, "/api/board/issue-pulls?org=acme&repo=api&number=99"],
    [
      "an issue of a repository the user cannot read",
      404,
      "/api/board/issue-pulls?org=acme&repo=hidden&number=1",
    ],
  ])("answers %s with HTTP %i", async (_, status, path) => {
    const { call, cookie } = await session({
      orgs: cardOrgs([], [], { hidden: [boardIssue("hidden", 1)] }),
    })

    const response = await call(path, { headers: { cookie } })

    expect(response.status).toBe(status)
  })
})
