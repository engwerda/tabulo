# Tabulo specification

Tabulo is a planning companion for [Forgejo](https://forgejo.org). It gives a team a personal
dashboard, a kanban board, and an epics view on top of Forgejo issues and pull requests.
Forgejo stays the single source of truth: Tabulo stores only what Forgejo cannot.

## Users

- **Developers** want one page that lists their assignments, review requests, mentions, and
  unread notifications across every repository they can access.
- **Leads and product owners** want a board across repositories and a view of epic progress.
- **Forgejo administrators** want a tool that needs no Forgejo plugins, no admin rights, and no
  shared service account.

## Principles

1. **Forgejo is the source of truth.** Board columns, epics, and assignments are Forgejo labels,
   issue references, and issue fields. Removing Tabulo loses only card order and saved views.
2. **Act as the signed-in user.** Every Forgejo API call uses that user's OAuth token. Forgejo
   permissions apply unchanged, and the issue history attributes each change to the person who
   made it.
3. **Instance specifics are configuration.** The Forgejo URL, column labels, and epic marker are
   settings. The code contains no organization names.

## Views

| View | Milestone | Contents |
|---|---|---|
| My dashboard | 1 | Review requests, open issues and pull requests assigned to me, mentions, items I created, and unread notifications. |
| Board | 2 | Columns from exclusive scoped labels across chosen repositories. A drag changes the issue's status label or closes or reopens it. |
| Epics | 3 | Each epic with its child issues and progress. |

## Data rules

- **Columns.** An open issue belongs to the column of its exclusive status label. The default
  scope is `Status/`, so `Status/In Progress` maps to the "In Progress" column. An open issue
  without a status label is in "Todo". An issue closed within the last 14 days is in "Done".
- **Epics.** An epic is an issue with the configured epic label (default `Type/Epic`). Its
  children are the issues its body references in task-list lines (`- [ ] #12`, `repo#12`, or an
  issue URL). Forgejo dependencies are not epic links, because teams already use them for
  ordering.
- **Card order.** Forgejo has no rank field, so Tabulo stores the order of cards within a column.
  The order belongs to the organization, so everyone sees the same order.

## Architecture

- One Cloudflare Worker serves the API and the React single-page app.
- The server uses Hono for HTTP and Effect for the Forgejo client, storage, and errors.
  Forgejo responses are decoded with Effect Schema at the boundary.
- D1 (SQLite) stores sessions and card order, and caches later. D1 is strongly consistent,
  so a refreshed token is never read stale. A Docker build with a SQLite file can replace D1
  later through the same storage service.
- The client uses React, TanStack Query, Tailwind CSS, wouter for routing, and dnd-kit for drag
  and drop.

### Sign-in

1. `GET /auth/login` stores a random `state` and a PKCE verifier, then redirects to Forgejo's
   authorize endpoint.
2. `GET /auth/callback` checks `state`, exchanges the code for access and refresh tokens, reads
   the Forgejo user, and creates a session. It deletes the session the browser already had.
3. The session cookie is random, `HttpOnly`, `Secure`, and `SameSite=Lax`. The database stores
   only its SHA-256 hash.
4. Tokens are encrypted with AES-GCM before they reach the database. They never reach the browser.
5. An expired access token is refreshed with the refresh token. The session ends only when
   Forgejo rejects the refresh token itself (`invalid_grant` or `unauthorized_client`). Any other
   token endpoint failure, such as `invalid_client` or a rate limit, returns HTTP 502 and keeps
   the session. Forgejo can rotate refresh tokens, so when concurrent requests refresh the same
   session, the first stored tokens win and the other requests use them.
6. `POST /auth/logout` deletes the session. Requests that change state must carry an `Origin`
   header equal to `APP_URL`.

### Board

A board shows the issues of chosen repositories in one organization. Pull requests are not on
the board.

- **Columns.** The status labels are the organization's exclusive, non-archived labels whose
  name starts with `BOARD_STATUS_SCOPE`. The columns are Todo, the status labels, and Done, in
  the order of `BOARD_COLUMNS`. Status labels it does not list come before Done in name order.
  A configured label that the organization does not have is skipped.
- **Card column.** A closed issue is in Done if it was closed within `BOARD_DONE_DAYS`, and is
  left off the board otherwise. An open issue with a label named like a status column is in
  that column, whether the label is the organization's or the repository's own. Every other
  open issue is in Todo. Such labels are hidden from the card; other labels in the scope, such
  as a repository's `Status/Abandoned`, show as ordinary labels. `boardLayout` in
  `src/worker/board.ts` is the only code that applies this rule.
- **Card order.** Every card has a rank, compared by code unit, and the order belongs to the
  organization, across all its repositories. Cards sort by rank, then by key. Two moves that
  land in the same gap at the same moment can store equal ranks; the key then orders them the
  same way for everyone, and a later move places a card after both.
- **Who arranges.** Only members of the organization may move or reorder cards. Forgejo
  authorizes each issue write as the user, so Tabulo does not check push access. Cards of
  archived repositories cannot be moved.

| Endpoint | Result |
|---|---|
| `GET /api/orgs` | The organizations the user belongs to. |
| `GET /api/orgs/:org/repos` | The organization's repositories the user can see, with `archived`. |
| `GET /api/board?org=&repos=a,b` | Columns, cards, `viewerCanArrange`, and `failedRepos`. At most 20 repositories. |
| `POST /api/board/move` | Moves one card and answers with `{ card, orderSaved }`. |

`GET /api/board` reads the organization's labels and whether the user is a member, then for each
repository the repository, its open issues, and the issues closed since the start of the Done
window. A repository that fails to load is listed in `failedRepos` with a message, and the
other repositories still show. Before it answers, it stores ranks in one D1 batch:

- A shown card without a stored rank for its current column, for example one moved in Forgejo,
  gets a rank after the largest stored rank of that column in the organization. Several such
  cards are ranked most recently updated first.
- Rows of issues that a loaded repository no longer lists (closed before the Done window,
  deleted, or transferred) are deleted. Rows of other repositories are kept.

`POST /api/board/move` takes `{ org, repo, number, toColumn, afterKey, beforeKey }`. `afterKey`
and `beforeKey` are the keys of the cards shown directly above and below the drop, or null.
Keys are `owner/repo#number`, lowercased, in the request's organization, at most 200
characters. The server:

1. Answers 400 to an invalid key, and 403 unless the user is a member of the organization or
   if the repository is archived.
2. Checks the neighbours against the stored ranks. If `afterKey` or `beforeKey` has no rank in
   the destination column, or `beforeKey` sorts before `afterKey`, the user's board is out of
   date: it answers 409 and changes nothing.
3. If the column changes, writes to Forgejo as the user. To a status column it adds that label,
   and Forgejo removes the issue's other labels in the same exclusive scope. To Todo it removes
   each status column label. To Done it closes the issue. From Done it changes the labels
   first, then reopens the issue. It never replaces the whole label set, so labels changed in
   Forgejo meanwhile survive. A Forgejo refusal of the first write answers with its status and
   changes nothing; a failure after an earlier write answers 502 saying Forgejo applied part
   of the move.
4. Stores one rank, the moved card's, directly after `afterKey` in the column's order across
   the organization: between that rank and the next larger stored rank. Cards the user cannot
   see keep their places. If D1 fails here, it answers 200 with `orderSaved: false`.

### Configuration

| Variable | Kind | Purpose |
|---|---|---|
| `APP_URL` | var | Public origin of Tabulo (https, no path). Builds the OAuth redirect URL `APP_URL/auth/callback`. |
| `FORGEJO_URL` | var | Base URL of the Forgejo instance. |
| `FORGEJO_CLIENT_ID` | var | OAuth2 application client ID. |
| `FORGEJO_CLIENT_SECRET` | secret | OAuth2 application client secret. |
| `SESSION_ENCRYPTION_KEY` | secret | 32 random bytes, base64. Encrypts stored tokens. |
| `BOARD_STATUS_SCOPE` | var | Prefix of the status labels, ending in `/`. Default `Status/`. |
| `BOARD_COLUMNS` | var | Optional column order: full status label names and the reserved words `Todo` and `Done`, comma-separated. Unlisted status labels come before Done in name order. A missing Todo goes first and a missing Done goes last. |
| `BOARD_DONE_DAYS` | var | Days a closed issue stays in Done, 1 to 365. Default 14. |

## Milestones

1. **Sign-in and my dashboard.** Read-only. Deployable to Cloudflare.
2. **Board.** Columns, drag and drop with writes as the user, card order in D1, filters.
3. **Epics and live updates.** Epics view, Forgejo webhooks, Docker image.

## Non-goals

- Replacing Forgejo's issue pages. Tabulo links to them for reading and editing details.
- Supporting forges other than Forgejo and Gitea-compatible APIs.
- Storing issue content as a second source of truth.
