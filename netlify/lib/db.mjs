// Shared database access for Functions.

import { getDatabase } from "@netlify/database";

let db;

// One client per Function instance; getDatabase() picks the right driver and branch.
export const database = () => (db ??= getDatabase());

// Runs fn(client) inside BEGIN / COMMIT, rolling back if it throws. Use it for every
// change that must be written together with its event (spec: Architecture, API row).
export async function transaction(fn) {
  const client = await database().pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
