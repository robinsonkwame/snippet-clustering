// GET /api/session: who is signed in on this browser. 401 when nobody is.
// Also the simplest example of a Function wrapped in withSession.

import { withSession } from "../lib/auth.mjs";
import { json } from "../lib/http.mjs";

export default withSession(async (req, context, session) =>
  json({ user: session.user, session_id: session.sessionId, expires_at: session.expiresAt.toISOString() }));

export const config = { path: "/api/session", method: "GET" };
