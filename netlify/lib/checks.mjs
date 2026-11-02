// Infrastructure checks behind /api/health and the status page.
// Each check returns { id, label, status: 'pass' | 'fail' | 'pending', detail, ms }.
// None of them reads or returns board data (snippets, cards, events).

import { getStore } from "@netlify/blobs";
import { passcodeRequired } from "./auth.mjs";
import { database } from "./db.mjs";

// Tables created by netlify/database/migrations; keep in step with new migrations.
export const EXPECTED_TABLES = [
  "users", "sessions", "snippets", "cards", "categories", "category_labels",
  "cell_notes", "notes", "comments", "locks", "relations", "relation_evidence",
  "propositions", "events", "sign_in_attempts",
];

// Blob stores the app uses. `snapshots` holds the CSV snapshots (spec: Backups);
// `system` holds small operational records such as the scheduler heartbeat.
export const SNAPSHOT_STORE = "snapshots";
export const SYSTEM_STORE = "system";
export const SCHEDULER_HEARTBEAT_KEY = "scheduler/last-run";
export const SNAPSHOT_INTERVAL_MINUTES = 15;

async function timed(id, label, fn) {
  const started = Date.now();
  try {
    const { status = "pass", detail } = await fn();
    return { id, label, status, detail, ms: Date.now() - started };
  } catch (error) {
    return { id, label, status: "fail", detail: describeError(error), ms: Date.now() - started };
  }
}

// db.sql wraps Postgres errors as "Failed query: ..." and keeps the real reason in `cause`.
const describeError = (error) =>
  error.cause?.message ? `${error.cause.message} (${error.message.split("\n")[0]})` : error.message;

export function checkFunctions(context) {
  return timed("functions", "Netlify Functions", async () => ({
    detail: `Node ${process.version}; deploy context: ${context?.deploy?.context ?? "unknown"}`,
  }));
}

export function checkDatabase() {
  return timed("database", "Netlify Database (Postgres)", async () => {
    // The database sleeps after 5 idle minutes; this first query may take a few seconds.
    const [row] = await database().sql`
      SELECT current_setting('server_version') AS version, current_database() AS name`;
    return { detail: `Connected to Postgres ${row.version} (database "${row.name}")` };
  });
}

export function checkSchema() {
  return timed("schema", "Schema migrations applied", async () => {
    const rows = await database().sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const present = new Set(rows.map((r) => r.table_name));
    const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
    if (missing.length) {
      return { status: "fail", detail: `Missing tables: ${missing.join(", ")}. Run the migrations.` };
    }

    // Netlify's own record of applied migrations. Informational only: on deployed sites the
    // platform owns this table and the Functions' role may not be allowed to read it.
    let applied = "";
    try {
      const migrations = await database().sql`SELECT name FROM netlify.migrations ORDER BY name`;
      applied = `; migrations: ${migrations.map((m) => m.name).join(", ")}`;
    } catch (error) {
      applied = `; migration history not readable here (${describeError(error)})`;
    }
    return { detail: `All ${EXPECTED_TABLES.length} tables present${applied}` };
  });
}

export function checkAppendOnly() {
  return timed("append_only", "Audit log is append-only", async () => {
    // Confirms the guard triggers are installed and enabled. The behaviour itself
    // (UPDATE, DELETE and TRUNCATE rejected) is exercised by `npm test`, so this check
    // never writes to the log or consumes event IDs.
    const rows = await database().sql`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = to_regclass('public.events') AND tgenabled = 'O' AND NOT tgisinternal`;
    const names = rows.map((r) => r.tgname);
    const required = ["events_no_update_delete", "events_no_truncate"];
    const missing = required.filter((n) => !names.includes(n));
    if (missing.length) {
      return { status: "fail", detail: `Guard trigger missing or disabled: ${missing.join(", ")}` };
    }
    return { detail: "UPDATE, DELETE and TRUNCATE on events are rejected by trigger" };
  });
}

export function checkSignIn() {
  return timed("sign_in", "Sign-in and sessions", async () => {
    const [{ users }] = await database().sql`
      SELECT count(*)::int AS users FROM users WHERE active AND access_id_hash IS NOT NULL`;
    const passcode = passcodeRequired() ? "board passcode required" : "no board passcode set";
    if (users === 0) {
      return {
        status: "pending",
        detail: `Ready, but no one can sign in yet: add people with scripts/users.mjs (${passcode})`,
      };
    }
    return { detail: `${users} active ${users === 1 ? "person" : "people"} can sign in; ${passcode}` };
  });
}

export function checkBlobs() {
  return timed("blobs", "Netlify Blobs (snapshot storage)", async () => {
    const store = getStore({ name: SNAPSHOT_STORE, consistency: "strong" });
    const key = `healthcheck/${Date.now()}-${Math.random().toString(36).slice(2)}.csv`;
    const body = "check,at\nblobs," + new Date().toISOString() + "\n";
    await store.set(key, body);
    const readBack = await store.get(key);
    await store.delete(key);
    if (readBack !== body) {
      return { status: "fail", detail: "Wrote a test CSV but read back different content" };
    }
    return { detail: `Wrote, read back and deleted a test CSV in store "${SNAPSHOT_STORE}"` };
  });
}

export function checkScheduler() {
  return timed("scheduler", "Scheduled function (15-minute snapshots)", async () => {
    const store = getStore({ name: SYSTEM_STORE, consistency: "strong" });
    const heartbeat = await store.get(SCHEDULER_HEARTBEAT_KEY, { type: "json" });
    if (!heartbeat) {
      return {
        status: "pending",
        detail: "Registered, but no run recorded yet. Runs every 15 minutes on Netlify; " +
          "locally, run `npx netlify functions:invoke scheduled-snapshot`.",
      };
    }
    const ageMinutes = (Date.now() - Date.parse(heartbeat.at)) / 60000;
    const stale = ageMinutes > SNAPSHOT_INTERVAL_MINUTES * 2 + 5;
    return {
      status: stale && heartbeat.context === "production" ? "fail" : "pass",
      detail: `Last run ${heartbeat.at} (${Math.round(ageMinutes)} min ago, context: ${heartbeat.context})`,
    };
  });
}

export async function runAllChecks(context) {
  // Functions and Blobs do not depend on the database, so run them alongside it.
  const [functions, blobs, scheduler, databaseCheck] = await Promise.all([
    checkFunctions(context),
    checkBlobs(),
    checkScheduler(),
    checkDatabase(),
  ]);
  const dbChecks = databaseCheck.status === "pass"
    ? await Promise.all([checkSchema(), checkAppendOnly(), checkSignIn()])
    : [];
  return [functions, databaseCheck, ...dbChecks, blobs, scheduler];
}
