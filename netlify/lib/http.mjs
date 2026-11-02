// Small HTTP helpers shared by Functions.

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export const errorResponse = (status, error, headers) => json({ error }, status, headers);

// Rejects a cross-site request. Browsers always send Origin on POST, so a mismatch means
// another site is posting here; the SameSite=Strict cookie is the first line of defence.
export function crossOrigin(req) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return errorResponse(403, "Cross-origin request refused");
  }
  return null;
}

// Parses a JSON body. Returns { body } or { response } with a 4xx to send back.
export async function readJson(req) {
  const refused = crossOrigin(req);
  if (refused) return { response: refused };
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return { response: errorResponse(415, "Send the body as application/json") };
  }
  try {
    return { body: await req.json() };
  } catch {
    return { response: errorResponse(400, "Body is not valid JSON") };
  }
}
