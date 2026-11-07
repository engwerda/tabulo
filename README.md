# Tabulo

Tabulo is a planning companion for [Forgejo](https://forgejo.org). It shows each person one page
with their review requests, the open issues and pull requests assigned to them, their mentions,
the items they created, and their unread notifications, across every repository they can access.

Forgejo stays the source of truth. Tabulo signs you in with Forgejo, reads with your own OAuth
token, and links back to Forgejo for every issue and pull request. It needs no Forgejo plugin,
no admin rights, and no shared service account. A board and an epics view follow in later
milestones; [docs/spec.md](docs/spec.md) describes the plan.

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

## Configuration

| Variable | Kind | Purpose |
|---|---|---|
| `APP_URL` | var | Public origin of Tabulo, with no path, for example `https://tabulo.example.com`. The OAuth redirect URL is `APP_URL/auth/callback`. |
| `FORGEJO_URL` | var | Base URL of the Forgejo instance. |
| `FORGEJO_CLIENT_ID` | var | OAuth2 application client ID. |
| `FORGEJO_CLIENT_SECRET` | secret | OAuth2 application client secret. |
| `SESSION_ENCRYPTION_KEY` | secret | 32 random bytes, base64. Encrypts the Forgejo tokens stored in D1. |

Production needs `https` in `APP_URL`. The session cookie uses the `__Host-` prefix, which
browsers accept only over HTTPS, with `http://localhost` as the one exception. Tabulo cannot be
served from a sub-path, and it refuses to start a request when `APP_URL` has a path, a query,
or credentials.

Changing `SESSION_ENCRYPTION_KEY` signs everyone out, because existing tokens no longer decrypt.

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

## License

Tabulo is free software under the [GNU General Public License v3.0 or later](LICENSE).
