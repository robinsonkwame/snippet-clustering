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
```

The local database starts empty and does not apply migrations by itself, so the schema checks fail until
you run `npm run db:migrate`. On Netlify, migrations apply automatically on every deploy (production and
previews), and a failing migration blocks the deploy.

Useful database commands: `npx netlify database status`, `npx netlify database connect`,
`npx netlify database connect --query "SELECT count(*) FROM events"`, `npx netlify database reset` (local only).

## Layout

```
netlify.toml                              build, functions, dev server, security headers
netlify/database/migrations/              SQL migrations, applied in name order (<timestamp>_<slug>.sql)
netlify/functions/health.mjs              GET /api/health
netlify/functions/scheduled-snapshot.mjs  cron: */15 * * * *
netlify/lib/checks.mjs                    shared code for Functions (not itself a Function)
public/                                   static site: status page and robots.txt
scripts/smoke.mjs                         health check against a running site
tests/schema.test.mjs                     vitest suite for the schema
```

## Conventions for the next steps

- **One Function per action** (spec: Architecture and hosting). Use `export const config = { path: "/api/<action>" }`.
  Put shared code in `netlify/lib/`, never in `netlify/functions/`, or Netlify will deploy it as a Function.
- **Database access:** `import { getDatabase } from "@netlify/database"`, then `db.sql\`...\`` for parameterized
  queries. For a change plus its event in one transaction, use `db.pool.connect()` with `BEGIN` / `COMMIT`
  (see the [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)).
- **Schema changes:** add a new migration file (`npx netlify database migrations new --description "..."`).
  Never edit a migration that has been deployed. Add any new table to `EXPECTED_TABLES` in `netlify/lib/checks.mjs`.
- **Events:** every write Function inserts its event in the same transaction as the change. The `action`
  column only accepts the actions listed in the spec; adding one needs a migration.
- **No real data in the repository or the build.** `.gitignore` excludes `snippets.json`, `data/` and ZIPs.

## Open items for whoever picks this up

1. **Sign-in is not built.** `/api/health` and the status page are public because they return no board
   data. Every Function added from here on must check the session first. `users.access_id_hash` and
   `sessions` are ready; lockout after five failed attempts still needs a place to count attempts.
2. **Append-only by role, not only by trigger.** The spec asks for a database role with INSERT and SELECT only
   on `events`. Netlify's docs do not say whether migrations can create roles or change grants, so the
   triggers enforce the rule for now. The table owner could still drop a trigger in a migration; reviews
   should watch for that.
3. **Snapshots.** `scheduled-snapshot` records a heartbeat only. It should write the CSV set from spec
   Section 9 when there are new events, without waking the database every 15 minutes (the database
   sleeps after 5 idle minutes, and a query every 15 minutes would keep it awake and use credits).
4. **Two Netlify projects**, mock and real (spec: Environments). Netlify Database needs a credit-based plan.
