// GET /api/health: runs the infrastructure checks and reports each result.
// Returns 200 when nothing failed (pending is allowed), 503 otherwise.
// Board data is never returned here, so this endpoint stays outside sign-in for now.

import { runAllChecks } from "../lib/checks.mjs";

export default async (req, context) => {
  const checks = await runAllChecks(context);
  const ok = checks.every((c) => c.status !== "fail");
  return Response.json(
    { ok, checked_at: new Date().toISOString(), deploy_context: context.deploy?.context, checks },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
};

export const config = { path: "/api/health", method: "GET" };
