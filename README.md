# Tabulo

Tabulo is a planning companion for [Forgejo](https://forgejo.org). It shows each person one page
with their review requests, the open issues and pull requests assigned to them, their mentions,
the items they created, and their unread notifications, across every repository they can access.

For a team lead it adds a kanban board across chosen repositories of one organization. Moving
a card changes the issue's status label, or closes or reopens it, in Forgejo. An insights page
charts the throughput, backlog, CI health, and repository health of the same repositories.

Forgejo stays the source of truth. Tabulo signs you in with Forgejo, acts with your own OAuth
token, and links back to Forgejo for every issue and pull request. It needs no Forgejo plugin,
no admin rights, and no shared service account. The only thing it stores besides sessions is
the order of cards within a board column. The epics view tracks larger pieces of work through
their child issues and pull requests. [docs/spec.md](docs/spec.md) describes the contract.

Tabulo is one Cloudflare Worker that serves both the API and the React app, with sessions in D1.

## Run Tabulo locally

You need Node.js 22.18 or later and an account on a Forgejo instance.

1. In Forgejo, open **Settings > Applications** and create an OAuth2 application. Set the
   redirect URI to `http://localhost:5173/auth/callback`. Keep the client ID and client secret.
2. Install the dependencies:

   ```sh
   npm ci
   ```

3. Copy the example settings and fill in your Forgejo URL, client ID, and client secret:

   ```sh
   cp .dev.vars.example .dev.vars
   ```

4. Generate the session encryption key and paste it as `SESSION_ENCRYPTION_KEY` in `.dev.vars`:

   ```sh
   openssl rand -base64 32
   ```

5. Create the local D1 tables:

   ```sh
   npm run db:migrate:local
   ```

6. Start the development server and open <http://localhost:5173>:

   ```sh
   npm run dev
   ```

## Deploy to Cloudflare

Tabulo needs a Cloudflare account with Workers and D1. The steps use `wrangler`, which is
installed as a development dependency.

Tabulo runs on a custom domain that you have added to Cloudflare, such as
`tabulo.example.com`. The `workers.dev` and preview URLs are turned off in `wrangler.jsonc`,
because sign-in and the session cookie work only on the one origin in `APP_URL`.

1. Create an OAuth2 application in Forgejo as in the local setup, with the redirect URI
   `https://<your Tabulo host>/auth/callback`.
2. Create the database, then copy the `database_id` it prints into the `d1_databases` entry in
   `wrangler.jsonc`:

   ```sh
   npx wrangler d1 create tabulo
   ```

3. In `wrangler.jsonc`, set the `routes` pattern to your Tabulo host, `APP_URL` to
   `https://<your Tabulo host>`, `FORGEJO_URL` to your Forgejo URL, and `FORGEJO_CLIENT_ID` to
   the client ID. Wrangler attaches the custom domain when you deploy.
4. Store the two secrets. Generate the encryption key with `openssl rand -base64 32`.

   ```sh
   npx wrangler secret put FORGEJO_CLIENT_SECRET
   npx wrangler secret put SESSION_ENCRYPTION_KEY
   ```

5. Create the tables in the remote database:

   ```sh
   npm run db:migrate:remote
   ```

6. Build and deploy:

   ```sh
   npm run deploy
   ```

Each `GET /auth/login` writes a sign-in state to D1 before the user has signed in. If your
Tabulo is reachable from the internet, add a
[rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/) for the path
`/auth/login` in the Cloudflare dashboard.

## Configuration

| Variable | Kind | Purpose |
|---|---|---|
| `APP_URL` | var | Public origin of Tabulo, with no path, for example `https://tabulo.example.com`. The OAuth redirect URL is `APP_URL/auth/callback`. |
| `FORGEJO_URL` | var | Base URL of the Forgejo instance. |
| `FORGEJO_CLIENT_ID` | var | OAuth2 application client ID. |
| `FORGEJO_CLIENT_SECRET` | secret | OAuth2 application client secret. |
| `SESSION_ENCRYPTION_KEY` | secret | 32 random bytes, base64. Encrypts the Forgejo tokens stored in D1. |
| `BOARD_STATUS_SCOPE` | var | Prefix of the status labels, ending in `/`. Default `Status/`. The board's columns are the organization's exclusive labels whose name starts with it. |
| `BOARD_COLUMNS` | var | Optional column order, comma-separated: full status label names such as `Status/In Progress`, and the reserved words `Todo` and `Done`. Status labels not listed come before Done in name order. Default: Todo, every status label by name, Done. |
| `BOARD_DONE_DAYS` | var | Issues closed within this many days appear in Done. A whole number from 1 to 365. Default `14`. |
| `EPIC_LABEL` | var | Full label name that marks an epic. Default `Type/Epic`. |

Production needs `https` in `APP_URL`. The session cookie uses the `__Host-` prefix, which
browsers accept only over HTTPS, with `http://localhost` as the one exception. Tabulo cannot be
served from a sub-path, and it refuses to start a request when `APP_URL` has a path, a query,
or credentials.

Changing `SESSION_ENCRYPTION_KEY` signs everyone out, because existing tokens no longer decrypt.

## Use the board

The board's columns come from the organization's exclusive labels in the status scope, which is
`Status/` unless `BOARD_STATUS_SCOPE` says otherwise. To set them up, open the organization's
**Settings > Labels** in Forgejo and create labels such as `Status/In Progress` and
`Status/Review` with **Exclusive** turned on.

- **Todo** holds open issues without a status label.
- Each status label is a column with its open issues.
- **Done** holds issues closed within the last 14 days (`BOARD_DONE_DAYS`).

Open **Board** in the header, choose an organization, and choose its repositories. The address
is `/board/<org>?repos=<repo>,<repo>`, so a board can be bookmarked or shared, filters included.

Drag a card by its handle with the mouse, or focus the handle and use Space and the arrow keys,
or pick a column in the card's column menu. Tabulo then changes the issue in Forgejo as you: it
adds the column's status label, removes it when the card goes to Todo, or closes or reopens the
issue. Other labels stay as they are. Forgejo decides whether you may change the issue, so a
triage member who can write issues but not code can move cards too.

The order of cards within a column is shared by everyone who opens the organization's board,
whichever repositories they chose. Only members of the organization can move and reorder
cards; others see the board read-only. Cards of archived repositories cannot be moved.

## Use the insights

Open **Insights** in the header, choose an organization, and choose its repositories, as for
the board. Pick a period of 30 days, 90 days, 6 months, or a year. The address is
`/insights/<org>?repos=<repo>,<repo>&days=<days>`, so a view can be bookmarked or shared.
Weeks start on Monday and hours are read in your browser's time zone. A period starts on the
Monday of its first week, so the page shows whole weeks; the current week is drawn lighter
because it is still in progress.

- **Stat tiles** show open issues and pull requests, issues opened and closed, pull requests
  merged, median times to close and merge, and the CI pass rate, each with its change from the
  period before.
- **Charts** show weekly throughput, the open issue backlog, time to merge, CI outcomes, when
  work happens by weekday and hour, the age of open issues, the top labels, contributors, and
  milestone progress. Each chart has a **Table** button that shows its numbers.
- **Needs attention** lists CI that fails on the default branch, overdue milestones, pull
  requests without an update for a week, and assigned issues without an update for three
  weeks. Each entry links to Forgejo.
- **Repositories** gives each repository a health score from 0 to 100 with the reasons it lost
  points. Expand a row to read them.

**Copy summary** copies a Markdown report of the page, for a chat message or a status update.

CI numbers come from Forgejo Actions. A repository with Actions turned off shows no CI data.
One page load reads at most 800 pages of issues, pull requests, runs, and milestones from
Forgejo. When a busy organization needs more, the page says which listings it read only in
part.

The dashboard starts with your contribution calendar for the last year, with your current and
longest streaks and your busiest day. Its **Table** button lists the days with contributions.

## Use the epics view

Add `Type/Epic` (or the full name in `EPIC_LABEL`) to an issue in Forgejo. In its body,
list children as tasks:

```md
- [ ] #12
- [x] web#34
- [ ] other-owner/repo#56
- [ ] https://your-forgejo.example/owner/repo/issues/78
- [ ] [Fix the login form](https://your-forgejo.example/owner/repo/issues/79)
1. [ ] **#90**: Login page
```

A bare number belongs to the epic's repository; `web#34` belongs to the same organization.
Only the first reference after a task checkbox counts, and pull request references count too.
Write the checkbox plainly, as Forgejo shows a checkbox only then: `\[ ]` and `**[ ]**` are text.
Tabulo reads the body as CommonMark, as Forgejo renders it, so code, HTML comments, and Forgejo
dependencies do not create links. An HTML comment that starts a line and is never closed hides
the rest of the body. Tabulo keeps the first 200 unique references in body order.

Open **Epics**, choose an organization and repositories, then expand a card to see its children.
The address `/epics/<org>?repos=<repo>,<repo>` keeps your selection, filters, and sort order,
so you can bookmark or share it. Search by title or reference, filter by state or epic assignee,
and sort by recent updates, completion, or child count.

Progress comes from each child's actual Forgejo state and the board's column rules, regardless
of its checkbox. Closed children count as Done, even when closed before the board's Done window.
Epics themselves appear while open or closed within `BOARD_DONE_DAYS`. Unavailable children
stay in the total and show as unavailable, including references beyond the request's limit of
200 individual child lookups. Like the insights, one page load reads at most 800 pages from
Forgejo, and the page says what it did not read when a busy organization needs more. The
summary counts open epics that have children but none done as at risk.
The page refreshes every minute.

## Search and shortcuts

Press `Cmd+K` (`Ctrl+K` on Windows and Linux), or choose **Search…** in the header, to open the
command menu. Type to find a view of an organization, a repository of the organization you used
last (or your first organization), an item on your dashboard, or an action such as switching the
theme. From two characters on, it also searches the issues and pull requests of every repository
you can access, open ones first. Press `Enter` to run the highlighted result and `Esc` to close
the menu. It lists the commands you used last when the query is empty.

| Key | Action |
|---|---|
| `Cmd/Ctrl+K` | Open the command menu |
| `?` | Show the keyboard shortcuts |
| `g` then `d` | Go to the dashboard |
| `g` then `b`, `i`, or `e` | Go to the board, insights, or epics of the organization you used last |

Keys without `Cmd` or `Ctrl` are ignored while you type in a field.

## Check a Forgejo instance

`npm run check:forgejo` runs the same Forgejo client and dashboard code as the Worker, using a
token you supply, and prints each section's count and first item. It only reads.

```sh
FORGEJO_URL=https://forgejo.example FORGEJO_TOKEN=<access token> npm run check:forgejo
```

The token needs read access to issues, repositories, notifications, and the user.

## Security

- Sign-in uses OAuth2 with PKCE (S256) and a single-use `state` that expires after 10 minutes
  and is bound to the browser that started the sign-in.
- The session cookie is a random value marked `HttpOnly`, `Secure`, and `SameSite=Lax`. D1
  stores only its SHA-256 hash. A session ends 30 days after sign-in.
- Access and refresh tokens are encrypted with AES-GCM before they are written to D1, and never
  reach the browser.
- Requests that change state must send an `Origin` header equal to `APP_URL`.
- A card move checks that you are a member of the organization and that the repository is not
  archived. Forgejo then authorizes each issue write as you.
- The app is served with a Content Security Policy that allows only Tabulo's own scripts,
  styles, and requests, and images from Tabulo and `FORGEJO_URL`. It also forbids framing.
  `npm run build` writes the policy to `dist/client/_headers` from `FORGEJO_URL` in
  `wrangler.jsonc`, so rebuild after you change it. API responses are never cached.

## License

Tabulo is free software under the [GNU General Public License v3.0 or later](LICENSE).
