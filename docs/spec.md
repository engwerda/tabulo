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
   issue references, and issue fields. Removing Tabulo loses only card order and boards, which
   are saved views.
2. **Act as the signed-in user.** Every Forgejo API call uses that user's OAuth token. Forgejo
   permissions apply unchanged, and the issue history attributes each change to the person who
   made it.
3. **Instance specifics are configuration.** The Forgejo URL, column labels, and epic marker are
   settings. The code contains no organization names.
4. **The organization owns its labels.** Tabulo never creates, renames, or deletes a label. A
   board picks its columns from the status labels the organization already has, so the people
   who manage the organization in Forgejo decide how many labels there are.

## Views

| View | Milestone | Contents |
|---|---|---|
| My dashboard | 1 | My contribution calendar, review requests, open issues and pull requests assigned to me, mentions, items I created, and unread notifications. |
| Board | 2, 4 | Shared boards per organization, each with its own repositories, column order, and hidden columns. Columns come from exclusive scoped labels. A card drag changes the issue's status label or closes or reopens it. |
| Insights | 2 | Throughput, backlog, merge time, CI health, needs attention, and repository health for chosen repositories. |
| Epics | 3 | Each epic with its child issues and progress. |

The board, insights, and epics are views of one organization. Insights and epics share its
chosen repositories, which the address holds in `?repos=a,b`. A board stores its own
repositories, so everyone who opens it sees the same board. The browser remembers each
organization's chosen repositories, its last board, and the last organization, so switching
views keeps them. An organization opened for the first time, with at most 20 repositories that
are not archived, starts with all of them chosen; clearing the choice is remembered too.
Browser storage records the Forgejo user id it belongs to. Signing out clears it, except the
theme and the address to return to after sign-in, and so does another user's sign-in in the same
browser; a tab whose session changes to another user reloads.

## Data rules

- **Columns.** An open issue belongs to the column of its exclusive status label. The default
  scope is `Status/`, so `Status/In Progress` maps to the "In Progress" column. An open issue
  without a status label is in "Todo". An issue closed within the last 14 days is in "Done".
- **Epics.** An epic is an issue with the configured epic label (default `Type/Epic`). Its
  children are the issues its body references in task-list items (`- [ ] #12`, `repo#12`, or an
  issue URL). Forgejo dependencies are not epic links, because teams already use them for
  ordering.
- **Card order.** Forgejo has no rank field, so Tabulo stores the order of cards within a column.
  The order belongs to the organization, so everyone sees the same order on every board.
- **Boards.** A board is a saved view of one organization: a name, at most 20 of its
  repositories, a column order, and the columns it hides. Every organization has a default
  board. Boards are shared, and any member of the organization may change them. Their cards
  stay Forgejo issues, and every board shows the same status labels as the same columns.

## Architecture

- One Cloudflare Worker serves the API and the React single-page app.
- The server uses Hono for HTTP and Effect for the Forgejo client, storage, and errors.
  Forgejo responses are decoded with Effect Schema at the boundary.
- D1 (SQLite) stores sessions, card order, and boards, and caches later. D1 is strongly
  consistent, so a refreshed token is never read stale. A Docker build with a SQLite file can
  replace D1 later through the same storage service.
- The client uses React, TanStack Query, Tailwind CSS, wouter for routing, and dnd-kit for drag
  and drop.

### Sign-in

1. `GET /auth/login` stores a random `state` and a PKCE verifier, then redirects to Forgejo's
   authorize endpoint. It asks for the scopes `read:user read:organization read:repository
   write:issue read:notification read:misc`. Forgejo keeps the scopes of a user's first grant to
   the application, so a grant made before Tabulo asked for scopes keeps every scope.
2. `GET /auth/callback` checks that `state` is the one in the browser's state cookie before it
   uses the stored state up, exchanges the code for access and refresh tokens, reads the Forgejo
   user, and creates a session. It deletes the session the browser already had.
3. The session cookie is random, `HttpOnly`, `Secure`, and `SameSite=Lax`. The database stores
   only its SHA-256 hash.
4. Tokens are encrypted with AES-GCM before they reach the database. They never reach the browser.
5. An expired access token is refreshed with the refresh token. The session ends only when
   Forgejo rejects the refresh token itself (`invalid_grant` or `unauthorized_client`). Any other
   token endpoint failure, such as `invalid_client` or a rate limit, returns HTTP 502 and keeps
   the session. Forgejo can rotate refresh tokens, so when concurrent requests refresh the same
   session, the first stored tokens win and the other requests use them. After a refresh,
   Tabulo reads the user again and stores their current login, name, and avatar, so a rename
   reaches the session within one access token's lifetime.
6. `POST /auth/logout` deletes the session. Requests that change state must carry an `Origin`
   header equal to `APP_URL`, and a body only as `application/json` of at most 1 MB; others
   answer 403, 415, and 413. An HTML form can post from Tabulo's own origin but cannot send JSON.
   Organization and repository names in a request have at most 100 characters.
7. Every Worker response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
   and `Strict-Transport-Security`. The static assets carry the CSP from `vite.config.ts`, which
   allows no form submission and no framing.

### Board

A board shows the issues of its repositories in one organization. Pull requests are not on
the board.

- **Boards.** Every organization has a default board with the id `default` and the name
  "Board". Until a member changes it, Tabulo stores nothing for it. Its columns then follow
  `BOARD_COLUMNS`, it hides none, and its repositories are the organization's repositories
  that are not archived when there are at most 20, and none otherwise. A board without
  repositories asks a member to choose them. A member may add up to 49 more boards. A new
  board's id is 8 random lowercase letters and digits, and it starts with the default board's
  column order and hidden columns. A name is trimmed text of 1 to 60 characters. The default
  board can be renamed but not deleted. Deleting a board deletes only the board; the card
  order stays.
- **Columns.** The status labels are the organization's exclusive, non-archived labels whose
  name starts with `BOARD_STATUS_SCOPE`. The columns are Todo, the status labels, and Done, in
  the board's order. Status labels the order does not list come before Done in name order, so
  a label added in Forgejo shows on every board. A label in the order that the organization
  does not have is skipped. A board can hide any column, Todo and Done included. A hidden
  column's cards are left off that board, and nothing changes in Forgejo or in the card order.
  A member sets the column order and the hidden columns in the board's settings, or drags a
  column by the grip in its header to move it. Either way the order is saved for the board, for
  everyone.
- **Card column.** A closed issue is in Done if it was closed within `BOARD_DONE_DAYS`, and is
  left off the board otherwise. An open issue with a label named like a status column is in
  that column, whether the label is the organization's or the repository's own. Every other
  open issue is in Todo. Such labels are hidden from the card; other labels in the scope, such
  as a repository's `Status/Abandoned`, show as ordinary labels. `boardLayout` in
  `src/worker/board.ts` is the only code that applies this rule.
- **Card order.** Every card has a rank, compared by code unit, and the order belongs to the
  organization, across all its repositories and boards. Cards sort by rank, then by key. Two
  moves that land in the same gap at the same moment can store equal ranks; the key then orders
  them the same way for everyone, and a later move places a card after both. Ranks span repositories
  that different users can read, so the ranks a user sees can show that cards they cannot read
  lie between two of theirs, though never which issues those are.
- **Who arranges.** Only members of the organization may move, reorder, or add cards, and add,
  change, or delete boards, as `/user/orgs` lists them for the user's token. Anyone
  may change a card's labels, milestone, or assignees, or comment; Forgejo decides. Forgejo
  authorizes each issue write as the user, so Tabulo does not check push access. Cards of
  archived repositories cannot be moved, added, edited, or commented on.
- **Repository access.** Forgejo decides which of a board's repositories each user can read. A
  repository the user cannot read is left out of the board without being named, so a board
  does not reveal the names of private repositories, only how many it leaves out. A change to
  a board keeps the stored repositories the user cannot read, so members with different access
  can share one board, unless the member asks to drop them. Only users who can see the
  organization in Forgejo can list or read its boards.
- **Address.** `/board/<org>` opens the default board and `/board/<org>/<id>` another board.
  An address with the old `repos` parameter opens the board and ignores it. Both take the
  client-side filters `q` (title words, or `#number` for one issue number), `assignee` (a
  login, `@me` for the viewer, or `@none`), `label` (a full label name or `@none`), and
  `milestone` (a title or `@none`). `assignee` and `label` can repeat; a card matches any of
  their values.
  `card=<repo>#<number>` opens that card's details. Logins cannot contain `@`; a milestone
  titled `@none` cannot be chosen by name.

| Endpoint | Result |
|---|---|
| `GET /api/orgs` | The organizations the user belongs to. |
| `GET /api/orgs/:org/repos` | The organization's repositories the user can see, with `archived`. |
| `GET /api/boards?org=` | The organization's boards, `{ boards }`, each with `id` and `name`, the default board first and the others by name. |
| `POST /api/boards` | Adds a board and answers with `{ board }`. |
| `POST /api/boards/update` | Changes a board and answers with `{ board }`. |
| `POST /api/boards/delete` | Deletes a board and answers with `{}`. |
| `GET /api/board?org=&board=` | The board, `columns` (the shown columns), `allColumns` (every column in the board's order), cards, `viewerCanArrange`, and `failedRepos`. `board` is a board id and defaults to `default`. |
| `POST /api/board/move` | Moves one card and answers with `{ card, orderSaved }`. |
| `POST /api/board/issues` | Creates an issue in a column and answers with `{ card, orderSaved }`. |
| `POST /api/board/assignees` | Adds or removes one assignee and answers with `{ card }`. |
| `POST /api/board/labels` | Adds or removes one label and answers with `{ card }`. |
| `POST /api/board/milestone` | Sets or clears the milestone and answers with `{ card }`. |
| `POST /api/board/comment` | Comments on the issue and answers with `{ comment }`. |
| `GET /api/board/issue?org=&repo=&number=` | The card's description and latest 20 comments as HTML, `{ key, bodyHtml, comments, commentCount }`. |
| `GET /api/board/issue-options?org=&repo=` | The labels, open milestones, and assignable users a card of the repository can take, `{ labels, milestones, assignees }`. |
| `GET /api/epics?org=&repos=a,b` | Epic cards, children, progress, board columns, `failedRepos`, and `incomplete`. At most 20 repositories. |

A board in an answer is `{ id, name, repos, unreadableRepos, columns, hidden, version }`.
`repos` holds only the repositories the user can read, and `unreadableRepos` counts the others
without naming them. `columns` is the stored column order as column keys, and `hidden` the
keys of the hidden columns. Board ids are compared without regard to case; text that cannot be
a board id names no board.

`POST /api/boards` takes `{ org, name, repos }`. `POST /api/boards/update` takes
`{ org, board, version, name, repos, columns, hidden, dropUnreadable }` and replaces those
fields. `POST /api/boards/delete` takes `{ org, board, version }`. `repos` is 1 to 20
repository names without duplicates, compared without regard to case. `columns` and `hidden`
are column keys without duplicates, at most 200 characters each; a key the organization has no
column for is kept and skipped when the board is read. The server:

1. Answers 400 to an invalid name, repository name, or key, and to deleting the default board.
2. Answers 403 unless the user is a member of the organization, and 404 with the code
   `board_not_found` when the organization has no such board.
3. Answers 409 and changes nothing when `version` is not the board's current version, because
   someone changed the board since the user loaded it. The default board's version is 0 until
   it is first stored. A new board starts at 1, and every change adds 1.
4. Answers 400 when `repos` names a repository the user cannot read, so a board never stores a
   name that its author could not see, and to a 51st board of the organization.
5. Keeps, in an update, the stored repositories the user cannot read, in addition to `repos`,
   and answers 400 when the two together are more than 20. With `dropUnreadable: true` it
   stores only `repos`. A repository that was deleted, renamed, or transferred is unreadable
   to everyone under its stored name, so this is the way to free its place.

`GET /api/boards` and `GET /api/board` answer 404 when Forgejo does not show the organization
to the user, and `GET /api/board` also, with the code `board_not_found`, when Forgejo shows the
organization but it has no such board. It reads the
board, the organization's labels, and whether the user is a member, then for each of the
board's repositories the repository, its open issues, and the issues closed since the start of
the Done window. A repository the user cannot read is left out, unnamed. Another repository
that fails to load is listed in `failedRepos` with a message, and the other repositories still
show. When the repository's own read fails, the user can read it only if the organization's
repository listing shows it. If that listing fails too, the board answers with the listing's
error instead of guessing. The columns depend on every label, so when the labels need more
than 100 pages, the board and `POST /api/board/move` answer HTTP 503 with
`{ error: "Too many Forgejo pages for one request; choose fewer repositories" }` instead of
using part of them. Before it answers, it stores ranks in one D1 batch:

- A shown card without a stored rank for its current column, for example one moved in Forgejo,
  gets a rank after the largest stored rank of that column in the organization. Several such
  cards are ranked most recently updated first.
- Rows of issues that a repository read to its end no longer lists (closed before the Done
  window, deleted, or transferred) are deleted. Rows of other repositories, and of a
  repository whose issues need more than 100 pages, are kept.
- Neither step touches a row written after the read started. Such a row comes from a move made
  while this read's Forgejo listing was already out of date.

Cards in hidden columns are ranked like the others, then left out of the answer, so hiding a
column never deletes a rank. Moves, new issues, and card edits do not name a board. A move
changes the issue's column on every board.

`POST /api/board/move` takes `{ org, repo, number, fromColumn, toColumn, afterKey, beforeKey }`.
`fromColumn` is the column the client showed the card in. `afterKey`
and `beforeKey` are the keys of the cards shown directly above and below the drop, or null.
Keys are `owner/repo#number`, lowercased, in the request's organization, at most 200
characters. The server:

1. Answers 400 to an invalid key, and 403 unless the user is a member of the organization or
   if the repository is archived.
2. Checks that the user's board is current. If Forgejo has the card in another column than
   `fromColumn`, if `afterKey` or `beforeKey` has no rank in the destination column or names
   an issue the user cannot read, or if `beforeKey` sorts before `afterKey`, it answers 409 and
   changes nothing. Acting on the stale view could undo someone else's change. A neighbour the
   user cannot read answers as one without a rank, so the answer does not tell which issues
   of a repository they cannot read exist.
3. If the column changes, writes to Forgejo as the user. To a status column it adds that label,
   and Forgejo removes the issue's other labels in the same exclusive scope; Tabulo then
   removes any other label named like a column that is left, such as a repository's
   non-exclusive one. To Todo it removes each status column label. To Done it closes the
   issue. From Done it changes the labels first, then reopens the issue. It never replaces the
   whole label set, so labels changed in Forgejo meanwhile survive. Forgejo 15 and later find
   the label to remove by name, then by the id of a repository label, so Tabulo removes an
   organization label by name; a repository label with the same name shadows it, so Tabulo
   refuses such a move to Todo with 403 before writing anything. It also reads the issue back
   after each removal and treats a label still there as a refusal. A Forgejo refusal of the first write answers with
   its status and changes nothing; a failure after an earlier write answers 502 saying Forgejo
   applied part of the move. A move that leaves the issue in another column stores no rank.
4. Stores one rank, the moved card's, directly after `afterKey` in the column's order across
   the organization: between that rank and the next larger stored rank. Cards the user cannot
   see keep their places. If D1 fails here, it answers 200 with `orderSaved: false`.

`POST /api/board/issues` takes `{ org, repo, title, column }`. The title is trimmed text of 1 to
255 characters. The server:

1. Answers 400 to an invalid name or title, and 403 unless the user is a member of the
   organization or if the repository is archived.
2. Answers 400 if `column` is Done, and 409 if it is no current column, such as a status label
   removed since the user's board was loaded.
3. Creates the issue in Forgejo as the user, with the column's status label for a status
   column. Forgejo drops the label without an error when the user cannot write the
   repository's issues; the card then lands in Todo. A Forgejo refusal answers with its status.
4. Stores the new card's rank before the smallest stored rank of the column it landed in,
   across the organization, so it shows first. If D1 fails here, it answers 200 with
   `orderSaved: false`.

The card edits `POST /api/board/assignees`, `labels`, `milestone`, and `comment` take
`{ org, repo, number }` and their own fields. Each answers 400 to an invalid name, number, or
field and to a pull request, and 403 if the repository is archived, before it writes. A
Forgejo refusal answers with its status. An edit that finds the issue already as asked writes
nothing. Forgejo ignores some writes without an error when the user may not make them; when
the issue is still not as asked after the write, Tabulo answers 403. The answered card is as
the board shows it, with its stored rank or the rank a board read would give it.

- `assignees` takes `{ login, assigned }`. Forgejo has no endpoint that adds a single
  assignee, so Tabulo reads the assignees and writes the whole list with the login added or
  removed. An assignee change made by someone else between the read and the write is lost.
  Forgejo ignores the list when the user cannot write the repository's issues.
- `labels` takes `{ labelId, present }` and adds or removes that one label, never the set. A
  status column label answers 400, because a card changes column only through a move. Forgejo
  ignores a label id it does not know.
- `milestone` takes `{ milestoneId }`, a milestone id or null. Null sends `milestone: 0`,
  which clears it. Forgejo answers 403 when the user cannot write the repository's issues and
  500 (Tabulo answers 502) for a milestone the repository does not have.
- `comment` takes `{ body }`, trimmed text of 1 to 65,535 characters, and answers with the new
  comment, its body rendered as in `GET /api/board/issue`. When the render fails after the
  comment is posted, the answer carries the comment's text as escaped HTML instead, so that a
  token refresh does not post it twice. Anyone who can read the repository
  may comment unless Forgejo has locked the issue.

`GET /api/board/issue` reads the issue's description and its comments and has Forgejo render
them (`POST /api/v1/markdown` in `comment` mode, as Forgejo shows an issue), at most four at
once. Forgejo does not page an issue's comments, so Tabulo reads them all and answers the
latest 20, oldest first, with `commentCount` for all of them. Empty text answers `""` without
a render. Anyone who can read the repository may ask; Forgejo
answers 404 for an issue the user cannot see. The client sanitizes the HTML again before
showing it.
### Insights

Insights aggregate the chosen repositories of one organization over a window that ends now. A
range of 1, 7, 30, 90, 180, or 365 days is counted in periods: hours for 1 day, days for 7, and
weeks for the rest. `INSIGHT_GRAIN` in `src/shared/api.ts` is that table. The window starts at
the beginning of the hour, day, or week that holds the moment the range's days before now. Every
period in it is whole except the current one, which the page marks as in progress, so 24 hours
have 25 periods and 7 days have 8. Every number has the same number for the window before it,
which is as long, so the page can show a change. Weeks start on Monday, and hours, days, and
weeks are read in the time zone the browser sends. An hour is named by the instant it starts,
because a daylight saving change repeats a wall-clock hour. Pull requests are counted apart from
issues everywhere. `buildInsights` in `src/worker/insights.ts` computes every aggregate from
decoded Forgejo data; loading only reads.

A request can narrow the numbers to one person with `user`, a login matched case-insensitively.
An issue or pull request involves the person who opened it and each of its assignees. Every
number counted from issues and pull requests then counts only the ones that involve that
person: the tiles, the series, the backlog, merge and close times, issue age, labels, the
punchcard, contributors, idle pull requests and issues, and each repository's open issues, open
pull requests, closed, merged, and activity. Milestones, languages, failing CI, overdue
milestones, and each repository's health and CI stay repository-wide. `people` lists everyone
who opened or is assigned to an issue or pull request that Tabulo read, whatever `user` is, so
the page can offer them.

For each repository Tabulo reads, as the user, the repository, its open issues and pull
requests, the issues and pull requests closed and updated since the previous window started,
its workflow runs created since then, its languages, and its open milestones. It reads two
repositories at a time. A repository that fails to load is listed in `failedRepos`, and the
others still show.

Workers allow 1,000 subrequests per request, so the listing pages of one request share a
budget of 800. The budget covers the whole request. When Forgejo rejects the token and Tabulo
refreshes it and reads again, the second attempt reads only the pages the first left. A
repository takes an equal share of the pages left when it starts and gives back what it does
not use. A listing that runs out of pages is named in `incomplete`, and the page and the
copied summary say which numbers are too low.

- **Backlog.** An issue is open at a time when it was created before it and not closed by it.
  An issue whose state is closed closed at its `closed_at`, or at its last update when Forgejo
  sends no `closed_at`. The backlog counts the issues open at the end of each period, or now
  for the current period.
- **Merge and close times.** Hours from creation to merge or close, for pull requests merged
  and issues closed in the window. The page shows the median and, for merges, the 75th and
  90th percentiles.
- **CI.** Workflow runs from `/actions/runs`, whose `started` and `stopped` give durations.
  The jobs that `/actions/tasks` lists are not used, because Forgejo's log cleanup rewrites
  their `updated_at` days after the job ran. The pass rate is passed runs among runs that
  passed or failed. A cancelled or skipped run has finished without failing. A start or stop
  time before 2000 means Forgejo never set it. A 404 or 403 from Forgejo means the repository
  has no CI data. A run has no author or assignee, only the user who triggered it, so runs are
  never narrowed to a person. With `user`, the CI summary and the pass rate tile are null.
- **Contributors.** A merged pull request counts for its author, a closed issue for each of
  its assignees. Forgejo does not say who closed an issue. With `user`, contributors come from
  the issues and pull requests that involve the person, so the people they worked with show
  too.
- **Needs attention.** Workflows whose latest finished run on the default branch failed, open
  milestones past their due date with open issues, non-draft pull requests without an update
  for 7 days, and assigned issues without an update for 21 days. In that order, then oldest
  first, at most 15.
- **Health.** A repository starts at 100 and each rule that applies subtracts its penalty.
  The score is strong from 80, watch from 60, and risky below. `HEALTH_RULES` in
  `src/worker/insights.ts` is the rule table. The rules read all of a repository's issues,
  pull requests, and runs, whatever `user` is. `unscored` names the CI and merge time rules
  when they had nothing to read in the window.

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
| `GET /api/insights?org=&repos=a,b&days=7&tz=Europe/Amsterdam&user=ada` | The `Insights` payload in `src/shared/api.ts`. `days` is 1, 7, 30, 90, 180, or 365 and defaults to 7. `tz` is an IANA time zone and defaults to UTC. `user` is a login of 1 to 40 letters, digits, `-`, `_`, or `.`, and narrows the numbers to that person; without it they count everyone. Other values answer 400. At most 20 repositories. |
| `GET /api/activity?tz=Europe/Amsterdam` | The signed-in user's days with contributions, total, current and longest streak, and busiest day. |

### Epics

An epic is an issue bearing the full `EPIC_LABEL` name. The Epics view shares the
organization's chosen repositories with insights. Its columns are the default board's, in that
board's order, hidden ones included, so progress counts every child. It shows open epics and
epics closed within `BOARD_DONE_DAYS`; pull requests cannot themselves be epics.

- **Children.** `parseEpicChildren` in `src/worker/epic-links.ts` parses the body as CommonMark
  with the reference parser, as Forgejo renders it, to find its list items: bullet (`-`, `*`,
  `+`) and ordered (`1.`, `1)`) items at any nesting depth, in block quotes too. Code blocks,
  HTML blocks, and HTML comments hold no list items, so they add no children. An item is a task
  when the source text of its first line, after the list marker, starts with `[ ]`, `[x]`, or
  `[X]` and a space or tab. Forgejo's task list extension reads the checkbox the same way, so an
  escaped (`\[ ]`) or emphasized (`**[ ]**`) checkbox is plain text, and a link definition
  named `x` does not change `[x]`.
- **References.** The first word after the checkbox, in the same source text, is `#12`,
  `repo#12`, `owner/repo#12`, or an issue or pull request URL on `FORGEJO_URL`, bare or as an
  autolink. It may be wrapped in `(`, `<`, `[`, `*`, or `_` and followed by punctuation, so
  `#12: Login`, `(#12)`, `**#12**`, and `<https://…/issues/12>` count. When the text after the
  checkbox starts with an inline link `[text](destination)`, as CommonMark reads it, the first word of its text is tried
  first and the destination URL second, so `[#12](…)` and `[Fix login](https://…/issues/12)`
  count. The destination must be an absolute `http` or `https` URL, and a reference-style link counts only by its
  text. A word in a code span or after an inline HTML comment is not a reference. Only the
  first reference of an item counts. A bare number refers to the epic's repository, a repo-only
  reference to its organization. The parser preserves body order, deduplicates case-insensitively, and caps each
  epic at 200 children. Forgejo dependencies do not create epic links.
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
  or the page budget becomes `{ _tag: "Unavailable", ref }`. Other child failures fail the
  request. Failed
  repositories enter `failedRepos`; an authentication failure still ends the request. This
  endpoint writes no Forgejo data or card ranks.
- **Page budget.** The organization labels, repository listings, and child lookups of one
  request share the 800-page budget that Insights uses, in that order. As on Insights, a retry
  after a token refresh reads only the pages the first attempt left, and it reads the labels
  again first. The columns depend on every label, so when the labels do not fit in the pages
  left, the request fails with HTTP 503 and
  `{ error: "Too many Forgejo pages for one request; choose fewer repositories" }`. A
  repository takes an equal share of the pages left when it starts and gives back what it does
  not use. Each child lookup takes one page when it starts. A listing that runs out of pages is
  named in `incomplete.listings`, and epics in its unread part are missing.
  `incomplete.children` counts the child references that were not looked up. With at most 20
  repositories read on each of two attempts and one token refresh, a request makes at most 842
  Forgejo requests.
- **Display.** Each epic exposes its issue details and board column, progress segments and
  legend, completion percentage, and an expandable child list. The response is
  `{ org, repos, columns, epics, failedRepos, incomplete }`; children are tagged `Issue` or
  `Unavailable`. When `incomplete` names anything, the page says what Tabulo did not read,
  and an empty page does not claim that there are no epics.
  Search (`q`), epic state (`state`), assignee (`assignee`), and sort (`sort`, values `updated`,
  `progress`, `children`) live in the URL. The default sort is most recently updated; progress
  and child-count sorts run descending with update time and key as tie breakers. The summary
  covers all selected epics, counts child completions across those epics, and marks open epics
  that have children but none completed as at risk. The client refreshes every minute.

### Search

The command menu searches issues and pull requests, and finds repositories, views, and the
boards of the last organization on the client.

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
organization, its last board, and its remembered repositories. Keys without `Cmd` or `Ctrl` do
nothing while the focus is in an input, textarea, select, or editable element, or while a modal
dialog is open.
The shortcuts are one list in `src/client/palette/shortcuts.ts`, which the key handler and the
shortcut list both read. On the board, `?` opens the board's own list in
`src/client/board/ShortcutsDialog.tsx`, which includes these; the board handles its single-key
shortcuts first, so they win over a sequence that starts with the same key.

### Configuration

| Variable | Kind | Purpose |
|---|---|---|
| `APP_URL` | var | Public origin of Tabulo (https, no path). Builds the OAuth redirect URL `APP_URL/auth/callback`. |
| `FORGEJO_URL` | var | Base URL of the Forgejo instance. |
| `FORGEJO_CLIENT_ID` | var | OAuth2 application client ID. |
| `FORGEJO_CLIENT_SECRET` | secret | OAuth2 application client secret. |
| `SESSION_ENCRYPTION_KEY` | secret | 32 random bytes, base64. Encrypts stored tokens. |
| `BOARD_STATUS_SCOPE` | var | Prefix of the status labels, ending in `/`. Default `Status/`. |
| `BOARD_COLUMNS` | var | Optional column order of a default board that no member has changed: full status label names and the reserved words `Todo` and `Done`, comma-separated. Unlisted status labels come before Done in name order. A missing Todo goes first and a missing Done goes last. |
| `BOARD_DONE_DAYS` | var | Days a closed issue stays in Done, 1 to 365. Default 14. |
| `EPIC_LABEL` | var | Full label name that marks an epic. Default `Type/Epic`. |

## Milestones

1. **Sign-in and my dashboard.** Read-only. Deployable to Cloudflare.
2. **Board.** Columns, drag and drop with writes as the user, card order in D1, filters.
3. **Epics and live updates.** Epics view, Forgejo webhooks, Docker image.
4. **Boards.** Shared boards per organization, each with its own repositories, column order,
   and hidden columns.

## Non-goals

- Replacing Forgejo's issue pages. Tabulo shows a description read-only and links to Forgejo
  for editing it, the title, and older comments.
- Supporting forges other than Forgejo and Gitea-compatible APIs.
- Storing issue content as a second source of truth.
