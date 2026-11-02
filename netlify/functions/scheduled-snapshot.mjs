// Scheduled every 15 minutes (spec: Backups and recovery, "App snapshot").
//
// For now it only records a heartbeat in Blobs, which /api/health reads to show the
// scheduler is running. It deliberately does not query the database: a query every
// 15 minutes would keep the database from sleeping and spend credits around the clock.
//
// TODO (snapshot work): when new events exist since the last snapshot, write the CSV set
// from spec Section 9 to the `snapshots` store under a timestamped prefix, and prune app
// snapshots older than 30 days. Decide how to detect "edits are happening" without waking
// the database, e.g. have write Functions set a "dirty" marker in the `system` store.

import { getStore } from "@netlify/blobs";
import { SCHEDULER_HEARTBEAT_KEY, SYSTEM_STORE } from "../lib/checks.mjs";

export default async (req, context) => {
  const { next_run } = await req.json().catch(() => ({}));
  const store = getStore({ name: SYSTEM_STORE, consistency: "strong" });
  await store.setJSON(SCHEDULER_HEARTBEAT_KEY, {
    at: new Date().toISOString(),
    next_run: next_run ?? null,
    context: context.deploy?.context ?? "unknown",
  });
};

export const config = { schedule: "*/15 * * * *" };
