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
- Time comes from Effect's `Clock`. Tests that depend on time or waiting pass the fake clock
  from `test/fake-clock.ts` to `tabulo()`, never real sleeps or timeouts.
- `SessionStore` owns token encryption. Nothing else reads or writes token columns.
- `boardLayout` in `src/worker/board.ts` is the one place that decides an issue's board column.
  `CardRanks` in `src/worker/card-ranks.ts` owns the `card_ranks` table.
- Board writes go through `moveCard`, which checks organization membership before any
  Forgejo write and stores ranks only after the writes succeed.
- `src/shared/card-order.ts` holds the card order rules (sorting and the rank of a drop) that
  the server and the client's optimistic update share.
- `src/client/board/board-view.ts` holds the client's pure board logic (column order, filters,
  drop neighbours). The worker tsconfig includes it so tests can import it.
- `src/client/scope/` owns the organization scope of the org-level views: `ORG_VIEWS` in
  `views.ts` lists them, `useRepoSelection` owns `?repos=` and the remembered selection, and
  `ScopeBar` is each view's heading. A view added to `ORG_VIEWS` appears in the header,
  and `ORG_VIEW_PAGES` in `src/client/App.tsx` then requires its page.
- `src/client/theme.ts` owns the light, dark, and system theme. `public/theme-init.js` applies
  it before first paint with the same storage key. Chart colors are the `--chart-*` properties
  in `src/client/styles.css`.
- `src/shared/api.ts` holds the API payload schemas. The client decodes responses with them.
- Imports use explicit `.ts` extensions so `scripts/` runs under Node without a build step.
