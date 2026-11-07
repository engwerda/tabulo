# Tabulo

Tabulo is a planning companion for [Forgejo](https://forgejo.org). It shows each person one page
with their review requests, the open issues and pull requests assigned to them, their mentions,
the items they created, and their unread notifications, across every repository they can access.

For a team lead it adds a kanban board across chosen repositories of one organization. Moving
a card changes the issue's status label, or closes or reopens it, in Forgejo.

Forgejo stays the source of truth. Tabulo signs you in with Forgejo, acts with your own OAuth
token, and links back to Forgejo for every issue and pull request. It needs no Forgejo plugin,
no admin rights, and no shared service account. The only thing it stores besides sessions is
the order of cards within a board column. An epics view follows in a later milestone;
[docs/spec.md](docs/spec.md) describes the plan.

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

### Try Tabulo without a Forgejo instance

`npm run dev:forgejo` starts a fake Forgejo on <http://localhost:3456> with a demo organization,
repositories, labels, and issues. It is the in-memory Forgejo the tests use, and it signs you in
as `ada` without asking. Point the development server at it, which replaces your `.dev.vars`,
and create the local tables:

```sh
node scripts/dev-forgejo.ts --print-vars > .dev.vars
npm run db:migrate:local
```

Then run `npm run dev:forgejo` and `npm run dev`, each in its own terminal, and open
<http://localhost:5173>.

The fake keeps its data in memory, so restarting it resets the demo and signs you out.

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

Drag a card with the mouse, or press and hold it on a touch screen. The column under it opens a
gap where the card will land. With the keyboard, focus a card's handle and use Space and the
arrow keys, or pick a column in the card's menu. Tabulo then changes the issue in Forgejo as
you: it adds the column's status label, removes it when the card goes to Todo, or closes or
reopens the issue. Other labels stay as they are. Forgejo decides whether you may change the
issue, so a triage member who can write issues but not code can move cards too. After a move,
**Undo** in the notification puts the card back.

When you add a card with the **+** in a column header or **New issue**, Tabulo creates the
issue in Forgejo as you, with the column's status label, and puts the card first in the column.
Click a card to open its details beside the board: the description and the latest 20 comments
as Forgejo renders them, and its labels, milestone, and assignees, which you can change there.
You can also add a comment. Tabulo makes each change in Forgejo as you, and Forgejo decides
whether you may. A status label is not offered there; move the card instead. The address names
the open card, so you can share it. Tabulo writes the whole assignee list, so an assignee
change someone makes at the same moment can be lost.

The filters narrow the board by text or `#number`, assignee, label, and milestone. **Assigned
to me** puts `assignee=@me` in the address, so a shared link shows each person their own cards.
`@none` stands for no assignee or no milestone. Collapse a column with the button in its header;
Tabulo remembers it in your browser. Press `?` on the board for the keyboard shortcuts, such as
`/` to search, `N` for a new issue, and `J` and `K` to browse cards in the details panel.

The order of cards within a column is shared by everyone who opens the organization's board,
whichever repositories they chose. Only members of the organization can move, reorder, and add
cards; others see the board read-only. Cards of archived repositories cannot be changed.

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
