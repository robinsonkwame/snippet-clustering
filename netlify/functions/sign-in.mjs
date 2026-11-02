// POST /api/sign-in  { "access_id": "...", "passcode": "..." }
// 200 with the session cookie and the person; 401 if not recognised; 429 while locked out.
// The 401 never says whether the access ID or the passcode was wrong.

import { LOCKOUT_MINUTES, sessionCookie, signIn } from "../lib/auth.mjs";
import { errorResponse, json, readJson } from "../lib/http.mjs";

export default async (req, context) => {
  const { body, response } = await readJson(req);
  if (response) return response;

  const result = await signIn({ accessId: body.access_id, passcode: body.passcode, ip: context.ip });

  if (result.status === "locked") {
    return errorResponse(429, `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes or less.`, {
      "Retry-After": String(result.retryAfterSeconds),
    });
  }
  if (result.status === "refused") return errorResponse(401, "Access ID or passcode not recognised");

  return json(
    { user: result.user, expires_at: result.expiresAt.toISOString() },
    200,
    { "Set-Cookie": sessionCookie(req, result.token, result.expiresAt) },
  );
};

export const config = { path: "/api/sign-in", method: "POST" };
