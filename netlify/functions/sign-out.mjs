// POST /api/sign-out: ends this browser's session and clears the cookie.

import { clearSessionCookie, signOut } from "../lib/auth.mjs";
import { crossOrigin, json } from "../lib/http.mjs";

export default async (req) => {
  const refused = crossOrigin(req);
  if (refused) return refused;
  await signOut(req);
  return json({ signed_out: true }, 200, { "Set-Cookie": clearSessionCookie(req) });
};

export const config = { path: "/api/sign-out", method: "POST" };
