// Applies the real migrations to a throwaway in-memory Postgres and checks the rules
// the specification puts on the data. Run with `npm test`.

import { NetlifyDB } from "@netlify/database-dev";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { EXPECTED_TABLES } from "../netlify/lib/checks.mjs";

let db;
let client;

beforeAll(async () => {
  db = new NetlifyDB({ logger: () => {} });
  const connectionString = await db.start();
  await db.applyMigrations("./netlify/database/migrations");
  client = new pg.Client({ connectionString });
  await client.connect();
  await client.query(`INSERT INTO users (user_id, display_name, role) VALUES ('tester', 'Tester', 'editor')`);
}, 60_000);

afterAll(async () => {
  await client?.end();
  await db?.stop();
});

const insertEvent = (action = "sign_in") =>
  client.query(
    `INSERT INTO events (board_version, user_id, action, target_type, target_id, after)
     VALUES ('test', 'tester', $1, 'board', 'board', '{"ok":true}') RETURNING event_id`,
    [action],
  );

describe("schema", () => {
  test("creates every table the health check expects", async () => {
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = rows.map((r) => r.table_name);
    for (const table of EXPECTED_TABLES) expect(names).toContain(table);
  });

  test("rejects a snippet with a side outside the list", async () => {
    await expect(client.query(
      `INSERT INTO snippets (snippet_id, paper_id, highlight_id, cite, text, codes, side, stance, reviewer, source_version)
       VALUES ('p|E1', 'p', 'E1', 'P 2025', 'quote', '{G1}', 'seller', 'documents', 'Kwame', 'test')`,
    )).rejects.toThrow(/check constraint/);
  });

  test("requires multi_pairs on a multi snippet", async () => {
    await expect(client.query(
      `INSERT INTO snippets (snippet_id, paper_id, highlight_id, cite, text, codes, side, stance, reviewer, source_version)
       VALUES ('p|E2', 'p', 'E2', 'P 2025', 'quote', '{G1}', 'multi', 'documents', 'Kwame', 'test')`,
    )).rejects.toThrow(/check constraint/);
  });

  test("rejects an event action outside the logged list", async () => {
    await expect(insertEvent("card_teleport")).rejects.toThrow(/check constraint/);
  });
});

describe("events is append-only", () => {
  test("accepts inserts with increasing event_id", async () => {
    const first = (await insertEvent()).rows[0].event_id;
    const second = (await insertEvent()).rows[0].event_id;
    expect(Number(second)).toBeGreaterThan(Number(first));
  });

  test("rejects UPDATE", async () => {
    await insertEvent();
    await expect(client.query(`UPDATE events SET conflict = true`)).rejects.toThrow(/append-only/);
  });

  test("rejects DELETE", async () => {
    await insertEvent();
    await expect(client.query(`DELETE FROM events`)).rejects.toThrow(/append-only/);
  });

  test("rejects TRUNCATE", async () => {
    await expect(client.query(`TRUNCATE events`)).rejects.toThrow(/append-only/);
  });

  test("keeps every inserted row", async () => {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM events`);
    expect(rows[0].n).toBe(4);
  });
});
