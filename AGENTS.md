# Agent guide

Tabulo is a Cloudflare Worker (Hono API plus a React SPA) that reads Forgejo as the signed-in
user. [docs/spec.md](docs/spec.md) is the contract.

## Commands

| Task | Command |
|---|---|
| Dev server (Worker and SPA on port 5173) | `npm run dev` |
| Lint and format check (Biome) | `npm run lint` |
| Apply formatting | `npm run format` |
| Type check (regenerates `worker-configuration.d.ts` first) | `npm run typecheck` |
| Tests (vitest in workerd, real D1 with migrations) | `npm test` |
| Production build | `npm run build` |
| Local D1 migrations | `npm run db:migrate:local` |
| Read-only check against a real Forgejo | `FORGEJO_URL=… FORGEJO_TOKEN=… npm run check:forgejo` |

Do not run `npm run deploy` or `wrangler deploy` unless the maintainer asks.

## Library versions

Tabulo uses Effect 4, TypeScript 7, Vite 8, vitest 4, and Tailwind CSS 4. Effect 4 changed
services (`Context.Service`), Schema, and errors (`Schema.TaggedError`) relative to Effect 3.
Read the installed declarations in `node_modules/effect/dist/*.d.ts` and
`node_modules/effect/AGENTS.md` before you use an API. Do not write from memory of an older
major version.

## Boundaries

- Hono is the HTTP layer. Effect runs the Forgejo client, session storage, crypto, and errors.
  Domain errors become HTTP responses only in `errorResponse` in `src/worker/app.ts`.
- Forgejo responses are decoded with Effect Schema in `src/worker/forgejo/`. Declare only the
  fields Tabulo reads. Code past the decoder trusts the decoded types.
- Outbound HTTP goes through the `fetch` passed to `createApp`. Tests pass the fake Forgejo
  from `test/fake-forgejo.ts`. Never mock Tabulo's own modules.
- `SessionStore` owns token encryption. Nothing else reads or writes token columns.
- `src/shared/api.ts` holds the API payload schemas. The client decodes responses with them.
- Imports use explicit `.ts` extensions so `scripts/` runs under Node without a build step.
