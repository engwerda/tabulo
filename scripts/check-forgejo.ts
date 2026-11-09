// Runs Tabulo's dashboard composition and its organization read against a real Forgejo instance,
// read-only. With FORGEJO_EPIC it also reads the issues that reference that issue from its
// timeline, as the Epics view does, and the parents each one's description names.
// Usage: FORGEJO_URL=https://forgejo.example FORGEJO_TOKEN=<token> [FORGEJO_EPIC=owner/repo#12]
//   npm run check:forgejo
import { Cause, Effect, Exit, Redacted } from "effect"
import { loadDashboardSections } from "../src/worker/dashboard.ts"
import { parseEpicParents } from "../src/worker/epic-links.ts"
import { ForgejoClient, makeForgejoClient } from "../src/worker/forgejo/client.ts"

const baseUrl = process.env.FORGEJO_URL?.replace(/\/+$/, "")
const token = process.env.FORGEJO_TOKEN
if (!baseUrl || !token) {
  console.error("Set FORGEJO_URL and FORGEJO_TOKEN (a token with read access to issues).")
  process.exit(2)
}
const epic = /^([^/#\s]+)\/([^/#\s]+)#([1-9][0-9]*)$/.exec(process.env.FORGEJO_EPIC ?? "")
if (process.env.FORGEJO_EPIC && epic === null) {
  console.error("Set FORGEJO_EPIC as owner/repo#12, or leave it out.")
  process.exit(2)
}
const TIMELINE_PAGES = 100

const forgejo = makeForgejoClient(
  // The OAuth fields are unused: the script reads with a token it already has.
  { baseUrl, clientId: "", clientSecret: Redacted.make(""), redirectUri: "" },
  (request) => fetch(request),
)
const accessToken = Redacted.make(token)

const program = Effect.gen(function* () {
  const user = yield* forgejo.currentUser(accessToken)
  const sections = yield* loadDashboardSections(accessToken)
  const [first] = yield* forgejo.userOrgs(accessToken)
  const org = first === undefined ? undefined : yield* forgejo.org(accessToken, first.name)
  if (epic === null) return { user, sections, org, referrers: undefined }
  const [, owner = "", name = "", number = ""] = epic
  const budget = { remaining: TIMELINE_PAGES }
  const listing = yield* forgejo.referencingIssues(
    accessToken,
    { owner, name },
    Number(number),
    budget,
  )
  const pages = TIMELINE_PAGES - budget.remaining
  return { user, sections, org, referrers: { ...listing, pages } }
}).pipe(Effect.provideService(ForgejoClient, forgejo))

const exit = await Effect.runPromiseExit(program)
if (Exit.isFailure(exit)) {
  console.error(`Forgejo check failed:\n${Cause.pretty(exit.cause)}`)
  process.exit(1)
}

const { user, sections, org, referrers } = exit.value
console.log(`Signed in as ${user.login} (${user.full_name || "no full name"}) on ${baseUrl}\n`)
console.log(
  org === undefined
    ? "organization: none to read"
    : `organization: ${org.name} (${org.full_name || "no full name"})`,
)
for (const [name, section] of Object.entries(sections)) {
  if (section._tag === "Failed") {
    console.log(`${name}: FAILED (${section.message})`)
    continue
  }
  console.log(`${name}: ${section.items.length} shown of ${section.total}`)
  const first = section.items[0]
  if (first !== undefined) console.log(`  first: ${JSON.stringify(first)}`)
}

if (epic !== null && referrers !== undefined) {
  const key = epic[0].toLowerCase()
  console.log(
    `\nissues that reference ${epic[0]}: ${referrers.items.length} in ${referrers.pages} timeline pages${
      referrers.complete ? "" : " (cut short)"
    }`,
  )
  for (const issue of referrers.items) {
    const parents = parseEpicParents(issue.body ?? "", issue.repository, baseUrl).map(
      ({ ref }) => ref,
    )
    console.log(
      `  ${issue.repository.full_name}#${issue.number} ${issue.state}: ${
        parents.length === 0 ? "names no parent" : `names ${parents.join(", ")}`
      }${parents.includes(key) ? " (a linked child)" : ""}`,
    )
  }
}
