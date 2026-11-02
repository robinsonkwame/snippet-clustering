# snippet-clustering

Web app for the NFT valuation paper: the **Value Matrix Board** described in
[Snippet Clustering Board Specification.md](Snippet%20Clustering%20Board%20Specification.md).

This commit sets up the Netlify infrastructure only. The board API and the UI are not built yet.
The home page (`public/index.html`) is a status page that runs live checks against everything below.

## What is in place

| Piece | Where | Checked by |
| --- | --- | --- |
| Netlify Functions (v2, ES modules) | `netlify/functions/` | `/api/health` |
| Netlify Database (Postgres): every table listed in the spec | `netlify/database/migrations/` | `/api/health`, `npm test` |
| Append-only `events` table (triggers reject UPDATE, DELETE, TRUNCATE) | same migration | `/api/health` (trigger present), `npm test` (behaviour) |
| Netlify Blobs: `snapshots` store for CSV snapshots, `system` store for operational records | `netlify/lib/checks.mjs` | `/api/health` (write, read, delete) |
| Sign-in and sessions: `/api/sign-in`, `/api/sign-out`, `/api/session`, lockout after five failures | `netlify/lib/auth.mjs`, `netlify/functions/` | `/api/health`, status page, `npm test` |
| Scheduled function, every 15 minutes (heartbeat only for now) | `netlify/functions/scheduled-snapshot.mjs` | `/api/health` |
| No indexing: `X-Robots-Tag: noindex` on every path, `robots.txt` disallows all | `netlify.toml`, `public/robots.txt` | status page, `npm run smoke` |

## Run it locally

Needs Node 20 or later. The Netlify CLI is a dev dependency, so `npx netlify` works without a global install.

```bash
npm install
npm test                 # migrations + schema rules against a throwaway in-memory Postgres
npm run dev              # netlify dev on http://localhost:8888, with a local Postgres and local Blobs
npm run db:migrate       # in another terminal, once per fresh local database
npm run smoke            # calls /api/health and checks the headers; exits non-zero on failure
npx netlify functions:invoke scheduled-snapshot --port 8888   # scheduled functions do not run on their own locally
node scripts/users.mjs set tester --name "Test Person" --role editor   # then sign in on the status page
```

The local database starts empty and does not apply migrations by itself, so the schema checks fail until
you run `npm run db:migrate`. On Netlify, migrations apply automatically on every deploy (production and
previews), and a failing migration blocks the deploy.

Useful database commands: `npx netlify database status`, `npx netlify database connect`,
`npx netlify database connect --query "SELECT count(*) FROM events"`, `npx netlify database reset` (local only).

## Sign-in

Only a salted scrypt hash is stored (`users.access_id_hash`),
and the passwords themselves never go in the repository. Manage people with the script, which asks for the access
password at a hidden prompt:

```bash
node scripts/users.mjs list
node scripts/users.mjs set kwame --name Kwame --role admin --backup
node scripts/users.mjs set malak --name Malak --role editor --backup
node scripts/users.mjs set ahmed --name Ahmed --role editor
node scripts/users.mjs revoke ahmed    # signs them out everywhere at once; `restore` undoes it
```

It uses the local `netlify dev` database unless `NETLIFY_DB_URL` is set. For a deployed project, a Team
Owner copies the production connection string from the Netlify UI (Data & Storage > Database). It holds
the database owner's password, so load it at a hidden prompt rather than typing it into a command, where
it would land in shell history:

```bash
read -rsp "Connection string: " NETLIFY_DB_URL && export NETLIFY_DB_URL && echo   # bash
read -rs "NETLIFY_DB_URL?Connection string: " && export NETLIFY_DB_URL && echo     # zsh
node scripts/users.mjs list        # an empty table on a new project, not your local test users
unset NETLIFY_DB_URL               # when done
```

- A session is a random token in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` over HTTPS) lasting
  12 hours. The database stores only the token's SHA-256 hash; `sessions.session_id` is a separate random ID
  that appears in `events.session_id`.
- Five failed attempts from one client within 15 minutes block that client (HTTP 429 with `Retry-After`).
  Client IPs are stored only as hashes, in `sign_in_attempts`.
- Each successful sign-in writes a `sign_in` event in the same transaction as the session.
- POSTs from another origin are refused.

Environment variables (set in the Netlify project, Site configuration > Environment variables):

| Variable | Effect |
| --- | --- |
| `BOARD_PASSCODE` | If set, sign-in requires this shared passcode as well as an access ID. This is the spec's open decision; leaving it unset turns it off. Mark it secret. |
| `BOARD_VERSION` | The `board_version` written on every event. Defaults to `v0-mock`. |

## Layout

```
netlify.toml                              build, functions, dev server, security headers
netlify/database/migrations/              SQL migrations, applied in name order (<timestamp>_<slug>.sql)
netlify/functions/health.mjs              GET /api/health
netlify/functions/sign-in.mjs             POST /api/sign-in
netlify/functions/sign-out.mjs            POST /api/sign-out
netlify/functions/session.mjs             GET /api/session (who is signed in)
netlify/functions/scheduled-snapshot.mjs  cron: */15 * * * *
netlify/lib/                              shared code for Functions (not themselves Functions):
  auth.mjs                                  sign-in, sessions, withSession()
  db.mjs                                    database() and transaction()
  events.mjs                                logEvent() for the audit log
  http.mjs                                  JSON responses, body parsing, origin check
  checks.mjs                                the health checks
public/                                   static site: status page and robots.txt
scripts/smoke.mjs                         health check against a running site
scripts/users.mjs                         add, list, revoke people who can sign in
tests/                                    vitest suites: schema rules; sign-in, sessions and lockout
```

## Conventions for the next steps

- **One Function per action** (spec: Architecture and hosting). Use `export const config = { path: "/api/<action>" }`.
  Put shared code in `netlify/lib/`, never in `netlify/functions/`, or Netlify will deploy it as a Function.
- **Every Function that touches board data is wrapped in `withSession`**, which answers 401 when nobody is
  signed in and 403 when a role is required and missing:

  ```js
  export default withSession(async (req, context, session) => { ... });              // anyone signed in
  export default withSession(async (req, context, session) => { ... }, { role: "admin" });
  ```

  Parse bodies with `readJson(req)` from `netlify/lib/http.mjs`; it also refuses cross-origin posts.
- **Database access:** `import { getDatabase } from "@netlify/database"`, then `db.sql\`...\`` for parameterized
  queries. For a change plus its event in one transaction, use `db.pool.connect()` with `BEGIN` / `COMMIT`
  (see the [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)).
- **Schema changes:** add a new migration file (`npx netlify database migrations new --description "..."`).
  Never edit a migration that has been deployed. Add any new table to `EXPECTED_TABLES` in `netlify/lib/checks.mjs`.
- **Events:** every write Function inserts its event in the same transaction as the change:
  `transaction(async (client) => { /* change */ await logEvent(client, { userId, sessionId, action, ... }); })`.
  The `action` column only accepts the actions listed in the spec; adding one needs a migration.
- **No real data in the repository or the build.** `.gitignore` excludes `snippets.json`, `data/` and ZIPs.

## Open items for whoever picks this up

1. **The status page and `/api/health` are public.** They return no board data. When the board UI arrives,
   its pages should send signed-out visitors to a sign-in screen, and the status page can move behind sign-in.
2. **Append-only by role, not only by trigger.** The spec asks for a database role with INSERT and SELECT only
   on `events`. Netlify's docs do not say whether migrations can create roles or change grants, so the
   triggers enforce the rule for now. The table owner could still drop a trigger in a migration; reviews
   should watch for that.
3. **Snapshots.** `scheduled-snapshot` records a heartbeat only. It should write the CSV set from spec
   Section 9 when there are new events, without waking the database every 15 minutes (the database
   sleeps after 5 idle minutes, and a query every 15 minutes would keep it awake and use credits).
4. **Two Netlify projects**, mock and real (spec: Environments). Netlify Database needs a credit-based plan.
5. **Check sign-in once deployed.** Locally, Functions talk to Postgres through `pg`. On Netlify,
   `@netlify/database` switches to its serverless driver, and `transaction()` (used by sign-in) has not yet
   run there. After the first deploy, sign in on the status page and confirm a `sign_in` event is logged.
6. **Lockout is per client IP**, as the most direct reading of the spec. It slows guessing from one place;
   it does nothing against someone who already knows a person's access ID. Only `BOARD_PASSCODE` covers that.
