// Sign-in and sessions (spec: Architecture and hosting, "Sign-in").
//
// People sign in with their Wayne State access ID, checked against a scrypt hash in
// users.access_id_hash. Access IDs are not secret, so if BOARD_PASSCODE is set in the
// environment it is required as well (open decision in the spec). A session is a random
// token in an HTTP-only cookie; the database keeps only its SHA-256 hash.

import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { database, transaction } from "./db.mjs";
import { logEvent } from "./events.mjs";
import { errorResponse } from "./http.mjs";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = "vmb_session";
export const SESSION_HOURS = 12;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const normalizeAccessId = (value) => String(value ?? "").trim().toLowerCase();

// Returns "scrypt$N$r$p$salt$hash" for storing in users.access_id_hash.
export async function hashAccessId(accessId) {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const hash = await scrypt(normalizeAccessId(accessId), salt, keylen, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyAccessId(accessId, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "scrypt" || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(normalizeAccessId(accessId), Buffer.from(salt, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

export const passcodeRequired = () => Boolean(process.env.BOARD_PASSCODE);

function passcodeMatches(given) {
  if (!passcodeRequired()) return true;
  // Compare digests so the comparison takes the same time whatever the lengths.
  return timingSafeEqual(
    Buffer.from(sha256(String(given ?? "")), "hex"),
    Buffer.from(sha256(process.env.BOARD_PASSCODE), "hex"),
  );
}

// Checks the access ID against every active user. There are three, and checking all of
// them (rather than stopping at a match) keeps the response time the same either way.
async function findUser(accessId) {
  const users = await database().sql`
    SELECT user_id, display_name, role, can_backup, access_id_hash
    FROM users WHERE active AND access_id_hash IS NOT NULL`;
  let match = null;
  for (const user of users) {
    if ((await verifyAccessId(accessId, user.access_id_hash)) && !match) match = user;
  }
  return match;
}

const publicUser = ({ user_id, display_name, role, can_backup }) => ({ user_id, display_name, role, can_backup });

// Failed attempts from this client since its last success, within the lockout window.
async function recentFailures(ipHash) {
  const [row] = await database().sql`
    SELECT count(*)::int AS failures, min(at) AS oldest
    FROM sign_in_attempts
    WHERE ip_hash = ${ipHash} AND NOT success
      AND at > now() - make_interval(mins => ${LOCKOUT_MINUTES})
      AND at > coalesce(
        (SELECT max(at) FROM sign_in_attempts WHERE ip_hash = ${ipHash} AND success), '-infinity')`;
  return row;
}

// Signs a person in. Returns { status: 'ok', user, token, expiresAt },
// { status: 'locked', retryAfterSeconds } or { status: 'refused' }.
export async function signIn({ accessId, passcode, ip }) {
  const ipHash = sha256(`sign-in:${ip ?? "unknown"}`);

  const { failures, oldest } = await recentFailures(ipHash);
  if (failures >= MAX_FAILED_ATTEMPTS) {
    const unlockAt = new Date(oldest).getTime() + LOCKOUT_MINUTES * 60_000;
    return { status: "locked", retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - Date.now()) / 1000)) };
  }

  const normalized = normalizeAccessId(accessId);
  const user = normalized && passcodeMatches(passcode) ? await findUser(normalized) : null;
  if (!user) {
    await database().sql`INSERT INTO sign_in_attempts (ip_hash, success) VALUES (${ipHash}, false)`;
    return { status: "refused" };
  }

  const token = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO sessions (session_id, token_hash, user_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [sessionId, sha256(token), user.user_id, expiresAt],
    );
    await client.query(
      `INSERT INTO sign_in_attempts (ip_hash, user_id, success) VALUES ($1, $2, true)`,
      [ipHash, user.user_id],
    );
    await logEvent(client, {
      userId: user.user_id, sessionId, action: "sign_in", targetType: "board", targetId: "board",
      after: { expires_at: expiresAt.toISOString() },
    });
  });

  return { status: "ok", user: publicUser(user), token, sessionId, expiresAt };
}

function readToken(req) {
  const cookies = req.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

// The signed-in person for this request, or null. A session ends when it expires, when
// it is signed out, or at once when the admin sets users.active to false.
export async function getSession(req) {
  const token = readToken(req);
  if (!token) return null;
  const [row] = await database().sql`
    SELECT s.session_id, s.expires_at, u.user_id, u.display_name, u.role, u.can_backup
    FROM sessions s JOIN users u ON u.user_id = s.user_id
    WHERE s.token_hash = ${sha256(token)}
      AND s.revoked_at IS NULL AND s.expires_at > now() AND u.active`;
  if (!row) return null;
  return { sessionId: row.session_id, expiresAt: new Date(row.expires_at), user: publicUser(row) };
}

export async function signOut(req) {
  const token = readToken(req);
  if (!token) return;
  await database().sql`
    UPDATE sessions SET revoked_at = now() WHERE token_hash = ${sha256(token)} AND revoked_at IS NULL`;
}

const secure = (req) => new URL(req.url).protocol === "https:";

export function sessionCookie(req, token, expiresAt) {
  const maxAge = Math.round((expiresAt.getTime() - Date.now()) / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure(req) ? "; Secure" : ""}`;
}

export const clearSessionCookie = (req) =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure(req) ? "; Secure" : ""}`;

// Wraps a Function handler so it only runs for a signed-in person:
//   export default withSession(async (req, context, session) => { ... });
//   export default withSession(handler, { role: "admin" });
// Every Function that reads or writes board data must be wrapped (spec: Access).
export function withSession(handler, { role } = {}) {
  return async (req, context) => {
    const session = await getSession(req);
    if (!session) return errorResponse(401, "Sign in first");
    if (role && session.user.role !== role) return errorResponse(403, `Only the ${role} can do this`);
    return handler(req, context, session);
  };
}
