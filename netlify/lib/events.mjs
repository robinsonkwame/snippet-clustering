// Writing to the append-only event log (spec: Audit log).

// The board version every event is filed under. Set BOARD_VERSION in the Netlify
// project's environment variables (e.g. "v1-pilot"); a lock that starts a new
// version will need this to move into the database.
export const boardVersion = () => process.env.BOARD_VERSION || "v0-mock";

// Inserts one event using `client`, which should be the transaction client that also
// writes the change itself. Returns { event_id, at }.
export async function logEvent(client, {
  userId, sessionId = null, action, targetType, targetId, before = null, after = null, conflict = false,
}) {
  const { rows } = await client.query(
    `INSERT INTO events (board_version, user_id, session_id, action, target_type, target_id, before, after, conflict)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
     RETURNING event_id, at`,
    [
      boardVersion(), userId, sessionId, action, targetType, targetId,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      conflict,
    ],
  );
  return rows[0];
}
