// Sign-in, sessions and lockout, calling the real Function handlers against a throwaway
// Postgres with the real migrations. Access IDs here are invented test values.

import { NetlifyDB } from "@netlify/database-dev";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

let db;
let client;
let auth;
let signInFn;
let signOutFn;
let sessionFn;

const BASE = "https://board.example";
let ipCounter = 0;
let ip;

const signIn = (body, { origin = BASE } = {}) =>
  signInFn(
    new Request(`${BASE}/api/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    }),
    { ip, deploy: { context: "dev" } },
  );

const cookieFrom = (res) => res.headers.get("set-cookie").split(";")[0];

const session = (cookie) =>
  sessionFn(new Request(`${BASE}/api/session`, { headers: cookie ? { cookie } : {} }), { ip });

const signOut = (cookie) =>
  signOutFn(new Request(`${BASE}/api/sign-out`, { method: "POST", headers: { cookie, origin: BASE } }), { ip });

beforeAll(async () => {
  db = new NetlifyDB({ logger: () => {} });
  process.env.NETLIFY_DB_URL = await db.start();
  delete process.env.BOARD_PASSCODE;
  await db.applyMigrations("./netlify/database/migrations");
  client = new pg.Client({ connectionString: process.env.NETLIFY_DB_URL });
  await client.connect();

  auth = await import("../netlify/lib/auth.mjs");
  signInFn = (await import("../netlify/functions/sign-in.mjs")).default;
  signOutFn = (await import("../netlify/functions/sign-out.mjs")).default;
  sessionFn = (await import("../netlify/functions/session.mjs")).default;

  await client.query(
    `INSERT INTO users (user_id, display_name, role, can_backup, access_id_hash) VALUES
       ('kwame', 'Kwame', 'admin', true, $1),
       ('ahmed', 'Ahmed', 'editor', false, $2)`,
    [await auth.hashAccessId("ab1234"), await auth.hashAccessId("cd5678")],
  );
}, 60_000);

afterAll(async () => {
  await (await import("../netlify/lib/db.mjs")).database().pool.end();
  await client?.end();
  await db?.stop();
});

beforeEach(() => {
  ip = `10.0.0.${++ipCounter}`; // a fresh client per test, so lockouts don't carry over
  delete process.env.BOARD_PASSCODE;
});

describe("access ID hashing", () => {
  test("verifies the same ID, ignoring case and spaces, and rejects others", async () => {
    const stored = await auth.hashAccessId("ab1234");
    expect(stored).toMatch(/^scrypt\$/);
    expect(stored).not.toContain("ab1234");
    expect(await auth.verifyAccessId(" AB1234 ", stored)).toBe(true);
    expect(await auth.verifyAccessId("ab1235", stored)).toBe(false);
  });

  test("salts each hash", async () => {
    expect(await auth.hashAccessId("ab1234")).not.toBe(await auth.hashAccessId("ab1234"));
  });
});

describe("sign-in", () => {
  test("a known access ID gets a session cookie and the person", async () => {
    const res = await signIn({ access_id: "AB1234" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ user_id: "kwame", display_name: "Kwame", role: "admin", can_backup: true });

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toMatch(/^vmb_session=[\w-]{43}; /);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=43200");
  });

  test("stores only the token hash, and logs a sign_in event", async () => {
    const res = await signIn({ access_id: "cd5678" });
    const token = cookieFrom(res).split("=")[1];
    const { rows: sessions } = await client.query(`SELECT * FROM sessions WHERE user_id = 'ahmed'`);
    expect(JSON.stringify(sessions)).not.toContain(token);

    const { rows: events } = await client.query(
      `SELECT * FROM events WHERE action = 'sign_in' AND user_id = 'ahmed' ORDER BY event_id DESC LIMIT 1`);
    expect(events[0].session_id).toBe(sessions.at(-1).session_id);
    expect(events[0].board_version).toBe("v0-mock");
  });

  test("an unknown access ID is refused without a cookie", async () => {
    const res = await signIn({ access_id: "zz9999" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("an empty access ID is refused", async () => {
    expect((await signIn({ access_id: "  " })).status).toBe(401);
  });

  test("a deactivated person is refused", async () => {
    await client.query(`UPDATE users SET active = false WHERE user_id = 'ahmed'`);
    try {
      expect((await signIn({ access_id: "cd5678" })).status).toBe(401);
    } finally {
      await client.query(`UPDATE users SET active = true WHERE user_id = 'ahmed'`);
    }
  });

  test("a cross-origin post is refused", async () => {
    expect((await signIn({ access_id: "ab1234" }, { origin: "https://evil.example" })).status).toBe(403);
  });

  test("a non-JSON body is refused", async () => {
    const res = await signInFn(
      new Request(`${BASE}/api/sign-in`, { method: "POST", body: "access_id=ab1234" }), { ip });
    expect(res.status).toBe(415);
  });
});

describe("board passcode", () => {
  test("when BOARD_PASSCODE is set, it is required", async () => {
    process.env.BOARD_PASSCODE = "correct horse";
    expect((await signIn({ access_id: "ab1234" })).status).toBe(401);
    expect((await signIn({ access_id: "ab1234", passcode: "wrong" })).status).toBe(401);
    expect((await signIn({ access_id: "ab1234", passcode: "correct horse" })).status).toBe(200);
  });
});

describe("lockout", () => {
  test("five failures lock the client out, even with the right ID", async () => {
    for (let i = 0; i < 5; i++) expect((await signIn({ access_id: "nope" })).status).toBe(401);
    const locked = await signIn({ access_id: "ab1234" });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(800);
  });

  test("another client is not affected", async () => {
    for (let i = 0; i < 5; i++) await signIn({ access_id: "nope" });
    ip = "10.9.9.9";
    expect((await signIn({ access_id: "ab1234" })).status).toBe(200);
  });

  test("a success resets the count", async () => {
    for (let i = 0; i < 4; i++) await signIn({ access_id: "nope" });
    expect((await signIn({ access_id: "ab1234" })).status).toBe(200);
    for (let i = 0; i < 4; i++) await signIn({ access_id: "nope" });
    expect((await signIn({ access_id: "ab1234" })).status).toBe(200);
  });

  test("the lock lifts after 15 minutes", async () => {
    for (let i = 0; i < 5; i++) await signIn({ access_id: "nope" });
    await client.query(`UPDATE sign_in_attempts SET at = at - interval '16 minutes' WHERE ip_hash IN (
      SELECT ip_hash FROM sign_in_attempts ORDER BY attempt_id DESC LIMIT 1)`);
    expect((await signIn({ access_id: "ab1234" })).status).toBe(200);
  });
});

describe("sessions", () => {
  test("a signed-out browser gets 401 from a protected Function", async () => {
    expect((await session(null)).status).toBe(401);
    expect((await session("vmb_session=made-up-token")).status).toBe(401);
  });

  test("the cookie identifies the person", async () => {
    const cookie = cookieFrom(await signIn({ access_id: "cd5678" }));
    const res = await session(cookie);
    expect(res.status).toBe(200);
    expect((await res.json()).user.user_id).toBe("ahmed");
  });

  test("sign-out ends the session and clears the cookie", async () => {
    const cookie = cookieFrom(await signIn({ access_id: "cd5678" }));
    const res = await signOut(cookie);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await session(cookie)).status).toBe(401);
  });

  test("an expired session is refused", async () => {
    const cookie = cookieFrom(await signIn({ access_id: "cd5678" }));
    await client.query(`UPDATE sessions SET expires_at = now() - interval '1 second'
      WHERE session_id = (SELECT session_id FROM sessions ORDER BY created_at DESC LIMIT 1)`);
    expect((await session(cookie)).status).toBe(401);
  });

  test("deactivating a person ends their sessions at once", async () => {
    const cookie = cookieFrom(await signIn({ access_id: "cd5678" }));
    await client.query(`UPDATE users SET active = false WHERE user_id = 'ahmed'`);
    try {
      expect((await session(cookie)).status).toBe(401);
    } finally {
      await client.query(`UPDATE users SET active = true WHERE user_id = 'ahmed'`);
    }
  });

  test("withSession enforces a role", async () => {
    const adminOnly = auth.withSession(async () => new Response("ok"), { role: "admin" });
    const editor = cookieFrom(await signIn({ access_id: "cd5678" }));
    const admin = cookieFrom(await signIn({ access_id: "ab1234" }));
    const call = (cookie) => adminOnly(new Request(`${BASE}/x`, { headers: { cookie } }), {});
    expect((await call(editor)).status).toBe(403);
    expect((await call(admin)).status).toBe(200);
  });
});
