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
- `boardLayout(statusScope, orgLabels, plan)` in `src/worker/board.ts` is the one place that
  decides the columns and an issue's column. A board passes its column order and hidden keys as
  the plan; moves, new issues, card edits, and issue options pass `UNORDERED`, and epics pass the
  default board's order without hiding anything. `CardRanks` in `src/worker/card-ranks.ts` owns
  the `card_ranks` table.
- `BoardStore` in `src/worker/board-store.ts` owns the `boards` table. Its writes compare and
  swap on the version the writer read, and its insert enforces the board limit. Board CRUD lives
  in `src/worker/boards.ts`, which checks membership and repository access and does every Forgejo
  read before the one D1 write. An answer never names a repository the user cannot read.
- Board writes live in `src/worker/board.ts`. `moveCard` and `createCard` check organization
  membership before any Forgejo write; the card edits (`setAssignee`, `setLabel`,
  `setMilestone`, `addComment`) refuse archived repositories and let Forgejo decide the rest.
  Ranks are stored only after the writes succeed.
- `src/shared/card-order.ts` holds the card order rules (sorting and the rank of a drop) that
  the server and the client's optimistic update share.
- `src/client/board/board-view.ts` holds the client's pure board logic (column order, filters,
  drop neighbours), and `board-settings.ts` the board settings dialog's (the draft, its requests,
  and the rebase after a 409). The worker tsconfig includes both so tests can import them.
- `src/client/scope/` owns the organization scope of the org-level views: `ORG_VIEWS` in
  `views.ts` lists them with their routes, `orgViewHref` builds every link to a view,
  `useRepoSelection` owns the `?repos=` of insights and epics, `remembered.ts` owns the remembered
  repositories, last board, and last organization, and `ScopeBar` is the heading of insights and
  epics. The board's header composes the same `OrgSwitcher` with `BoardSwitcher`. A view added to
  `ORG_VIEWS` appears in the header, and `ORG_VIEW_PAGES` in `src/client/App.tsx` then requires
  its page.
- `src/client/theme.ts` owns the light, dark, and system theme. `public/theme-init.js` applies
  it before first paint with the same storage key. Chart colors are the `--chart-*` properties
  in `src/client/styles.css`.
- `buildInsights` in `src/worker/insights.ts` computes every insights aggregate from decoded
  Forgejo data, with no Effect services; `src/worker/load-insights.ts` only reads. The client's
  charts in `src/client/charts/` are hand-built SVG and color from the `--chart-*` tokens.
- `src/shared/api.ts` holds the API payload schemas. The client decodes responses with them.
- Deployment values (hosts, the OAuth client ID, the D1 `database_id`) go in the gitignored
  `wrangler.deploy.jsonc`, never in `wrangler.jsonc`, which is the public template.
  `vite.config.ts` merges it into the build.
- Imports use explicit `.ts` extensions so `scripts/` runs under Node without a build step.
