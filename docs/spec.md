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
| My dashboard | 1 | My contribution calendar, review requests, open issues and pull requests assigned to me, mentions, items I created, and unread notifications. |
| Board | 2 | Columns from exclusive scoped labels across chosen repositories. A drag changes the issue's status label or closes or reopens it. |
| Insights | 2 | Throughput, backlog, merge time, CI health, needs attention, and repository health for chosen repositories. |
| Epics | 3 | Each epic with its child issues and progress. |

The board, insights, and epics are views of one organization. They share its chosen
repositories, which the address holds in `?repos=a,b`. The browser remembers each
organization's repositories and the last organization, so switching views keeps both.

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
| `GET /api/epics?org=&repos=a,b` | Epic cards, children, progress, board columns, and `failedRepos`. At most 20 repositories. |

`GET /api/board` reads the organization's labels and whether the user is a member, then for each
repository the repository, its open issues, and the issues closed since the start of the Done
window. A repository that fails to load is listed in `failedRepos` with a message, and the
other repositories still show. Before it answers, it stores ranks in one D1 batch:

- A shown card without a stored rank for its current column, for example one moved in Forgejo,
  gets a rank after the largest stored rank of that column in the organization. Several such
  cards are ranked most recently updated first.
- Rows of issues that a loaded repository no longer lists (closed before the Done window,
  deleted, or transferred) are deleted. Rows of other repositories are kept.
- Neither step touches a row written after the read started. Such a row comes from a move made
  while this read's Forgejo listing was already out of date.

`POST /api/board/move` takes `{ org, repo, number, fromColumn, toColumn, afterKey, beforeKey }`.
`fromColumn` is the column the client showed the card in. `afterKey`
and `beforeKey` are the keys of the cards shown directly above and below the drop, or null.
Keys are `owner/repo#number`, lowercased, in the request's organization, at most 200
characters. The server:

1. Answers 400 to an invalid key, and 403 unless the user is a member of the organization or
   if the repository is archived.
2. Checks that the user's board is current. If Forgejo has the card in another column than
   `fromColumn`, if `afterKey` or `beforeKey` has no rank in the destination column, or if
   `beforeKey` sorts before `afterKey`, it answers 409 and changes nothing. Acting on the stale
   view could undo someone else's change.
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

### Insights

Insights aggregate the chosen repositories of one organization over a window that ends now and
starts at midnight on the Monday of the week 30, 90, 180, or 365 days ago. Every week in it is
whole except the current one, which the page marks as in progress. Every number has the same
number for the window before it, which is as long, so the page can show a change. Weeks start
on Monday and days and hours are read in the time zone the browser sends. Pull requests are counted apart from issues everywhere. `buildInsights` in
`src/worker/insights.ts` computes every aggregate from decoded Forgejo data; loading only reads.

For each repository Tabulo reads, as the user, the repository, its open issues and pull
requests, the issues and pull requests closed and updated since the previous window started,
its workflow runs created since then, its languages, and its open milestones. It reads two
repositories at a time. A repository that fails to load is listed in `failedRepos`, and the
others still show.

Workers allow 1,000 subrequests per request, so the listing pages of one request share a
budget of 800. A repository takes an equal share of the pages left when it starts and gives
back what it does not use. A listing that runs out of pages is named in `incomplete`, and the
page and the copied summary say which numbers are too low.

- **Backlog.** An issue is open at a time when it was created before it and not closed by it.
  An issue whose state is closed closed at its `closed_at`, or at its last update when Forgejo
  sends no `closed_at`. The weekly backlog counts the issues open at the end of each week, or now for the current
  week.
- **Merge and close times.** Hours from creation to merge or close, for pull requests merged
  and issues closed in the window. The page shows the median and, for merges, the 75th and
  90th percentiles.
- **CI.** Workflow runs from `/actions/runs`, whose `started` and `stopped` give durations.
  The jobs that `/actions/tasks` lists are not used, because Forgejo's log cleanup rewrites
  their `updated_at` days after the job ran. The pass rate is passed runs among runs that
  passed or failed. A cancelled or skipped run has finished without failing. A start or stop
  time before 2000 means Forgejo never set it. A 404 or 403 from Forgejo means the repository
  has no CI data.
- **Contributors.** A merged pull request counts for its author, a closed issue for each of
  its assignees. Forgejo does not say who closed an issue.
- **Needs attention.** Workflows whose latest finished run on the default branch failed, open
  milestones past their due date with open issues, non-draft pull requests without an update
  for 7 days, and assigned issues without an update for 21 days. In that order, then oldest
  first, at most 15.
- **Health.** A repository starts at 100 and each rule that applies subtracts its penalty.
  The score is strong from 80, watch from 60, and risky below. `HEALTH_RULES` in
  `src/worker/insights.ts` is the rule table.

| Rule | Penalty |
|---|---|
| CI passes under 90% of runs (under 70%) | 15 (30) |
| CI fails on the default branch | 15 |
| Median merge time over 3 days (over 7 days) | 5 (15) |
| Pull requests without an update for 7 days | 5 each, at most 20 |
| Open issues grew by 5 or more and by 25% or more | 15 |
| No activity for 21 days (60 days), unless archived | 10 (25) |
| Overdue milestones | 10 each, at most 20 |

The contribution calendar sums the user's Forgejo heatmap, which counts contributions in
15-minute slots, per day in the browser's time zone over the last 365 days. The heatmap covers
the last 365 times 24 hours, which always contains the whole first day in every time zone. A
streak that has no contribution yet today still counts until the day ends.

| Endpoint | Result |
|---|---|
| `GET /api/insights?org=&repos=a,b&days=90&tz=Europe/Amsterdam` | The `Insights` payload in `src/shared/api.ts`. `days` is 30, 90, 180, or 365 and defaults to 90. `tz` is an IANA time zone and defaults to UTC. Other values answer 400. At most 20 repositories. |
| `GET /api/activity?tz=Europe/Amsterdam` | The signed-in user's days with contributions, total, current and longest streak, and busiest day. |

### Epics

An epic is an issue bearing the full `EPIC_LABEL` name. The Epics view shares the board's
organization and repository selection. It shows open epics and epics closed within
`BOARD_DONE_DAYS`; pull requests cannot themselves be epics.

- **Children.** Task-list lines begin with `- [ ]`, `- [x]`, the equivalent `*` or `+`
  marker, or an ordered marker such as `1. [ ]` or `1) [ ]`. The first word after the checkbox
  is `#12`, `repo#12`, `owner/repo#12`, or an issue or pull request URL on `FORGEJO_URL`. It
  may be wrapped in `(`, `<`, `[`, `*`, or `_` and followed by punctuation, so `#12: Login`,
  `(#12)`, `**#12**`, and `[#12](…)` count. Only the first reference on a line counts. A bare
  number refers to the epic's repository, a repo-only reference to its organization. The pure
  `parseEpicChildren` function in `src/worker/epics.ts` ignores fenced and indented code
  (indentation counts from the enclosing list item) and HTML comments, preserves body order,
  deduplicates case-insensitively, and caps each epic at 200 children. Forgejo dependencies do
  not create epic links.
- **Progress.** Checkbox state is ignored. The child's real issue state and labels determine
  its column through `boardLayout`, including repository status labels matching an organization
  column. Every closed child is Done, however old. Pull request children are marked as pull
  requests. Progress reports `total`, `done`, and `byColumn` keyed by the board's column keys.
  Unavailable references stay in `total` but do not enter any column or count as Done.
- **Reads.** The endpoint reads organization labels and each repository's metadata, open issues,
  and issues updated since the Done window that are closed. Epic bodies use a separate Forgejo
  schema; the board's decoder and payload are unchanged. Listed issues resolve children where
  possible. Missing children, including older closed issues and pull requests, are read
  individually with at most four concurrent requests and 200 unique lookups per endpoint call.
  Duplicate references across epics share that lookup. A 403, 404, or lookup beyond that cap
  becomes `{ _tag: "Unavailable", ref }`. Other child failures fail the request. Failed
  repositories enter `failedRepos`; an authentication failure still ends the request. This
  endpoint writes no Forgejo data or card ranks.
- **Display.** Each epic exposes its issue details and board column, progress segments and
  legend, completion percentage, and an expandable child list. The response is
  `{ org, repos, columns, epics, failedRepos }`; children are tagged `Issue` or `Unavailable`.
  Search (`q`), epic state (`state`), assignee (`assignee`), and sort (`sort`, values `updated`,
  `progress`, `children`) live in the URL. The default sort is most recently updated; progress
  and child-count sorts run descending with update time and key as tie breakers. The summary
  covers all selected epics, counts child completions across those epics, and marks open epics
  that have children but none completed as at risk. The client refreshes every minute.

### Search

The command menu searches issues and pull requests, and finds repositories and views on the
client.

| Endpoint | Result |
|---|---|
| `GET /api/search?q=&limit=` | `{ items }`: issues and pull requests across every repository the user can read, as dashboard items. |
| `GET /api/instance` | `{ forgejoUrl }`, so the client can link to a repository's page. |

`q` is trimmed text of 1 to 100 characters, and Forgejo matches it against titles and
descriptions. `limit` is a positive integer, default 10, and larger values answer with 20. The
server answers 400 to a `q` or `limit` outside this. It asks Forgejo's `GET /repos/issues/search`
as the user, first for `state=open` and then, for what is left of the limit, `state=closed`, so
open items come first. Each state is read page by page until the limit is met or the matches
run out, because Forgejo's page size can be below the limit. The menu does not search before two characters, and waits 200 ms after
the last key.

### Keyboard shortcuts

`Cmd` or `Ctrl` with `K` opens the menu, `?` opens the shortcut list, and `g` followed within a
second by `d`, `b`, `i`, or `e` goes to the dashboard, board, insights, or epics, using the last
organization and its remembered repositories. Keys without `Cmd` or `Ctrl` do nothing while the
focus is in an input, textarea, select, or editable element. The shortcuts are one list in
`src/client/palette/shortcuts.ts`, which the key handler and the shortcut list both read.

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
| `EPIC_LABEL` | var | Full label name that marks an epic. Default `Type/Epic`. |

## Milestones

1. **Sign-in and my dashboard.** Read-only. Deployable to Cloudflare.
2. **Board.** Columns, drag and drop with writes as the user, card order in D1, filters.
3. **Epics and live updates.** Epics view, Forgejo webhooks, Docker image.

## Non-goals

- Replacing Forgejo's issue pages. Tabulo links to them for reading and editing details.
- Supporting forges other than Forgejo and Gitea-compatible APIs.
- Storing issue content as a second source of truth.
