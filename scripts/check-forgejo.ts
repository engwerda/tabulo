// Runs Tabulo's dashboard composition against a real Forgejo instance, read-only.
// Usage: FORGEJO_URL=https://forgejo.example FORGEJO_TOKEN=<token> npm run check:forgejo
import { Cause, Effect, Exit, Redacted } from "effect"
import { loadDashboardSections } from "../src/worker/dashboard.ts"
import { ForgejoClient, makeForgejoClient } from "../src/worker/forgejo/client.ts"

const baseUrl = process.env.FORGEJO_URL?.replace(/\/+$/, "")
const token = process.env.FORGEJO_TOKEN
if (!baseUrl || !token) {
  console.error("Set FORGEJO_URL and FORGEJO_TOKEN (a token with read access to issues).")
  process.exit(2)
}

const forgejo = makeForgejoClient(
  // The OAuth fields are unused: the script reads with a token it already has.
  { baseUrl, clientId: "", clientSecret: Redacted.make(""), redirectUri: "" },
  (request) => fetch(request),
)
const accessToken = Redacted.make(token)

const program = Effect.gen(function* () {
  const user = yield* forgejo.currentUser(accessToken)
  const sections = yield* loadDashboardSections(accessToken)
  return { user, sections }
}).pipe(Effect.provideService(ForgejoClient, forgejo))

const exit = await Effect.runPromiseExit(program)
if (Exit.isFailure(exit)) {
  console.error(`Forgejo check failed:\n${Cause.pretty(exit.cause)}`)
  process.exit(1)
}

const { user, sections } = exit.value
console.log(`Signed in as ${user.login} (${user.full_name || "no full name"}) on ${baseUrl}\n`)
for (const [name, section] of Object.entries(sections)) {
  if (section._tag === "Failed") {
    console.log(`${name}: FAILED (${section.message})`)
    continue
  }
  console.log(`${name}: ${section.items.length} shown of ${section.total}`)
  const first = section.items[0]
  if (first !== undefined) console.log(`  first: ${JSON.stringify(first)}`)
}
