// Manage who can sign in to the board. Access IDs are typed at a hidden prompt and only
// their hash is stored; they never appear in the repository, the shell history or logs.
//
//   node scripts/users.mjs list
//   node scripts/users.mjs set <user_id> --name <display name> --role admin|editor [--backup]
//   node scripts/users.mjs revoke <user_id>     # blocks sign-in and ends their sessions now
//   node scripts/users.mjs restore <user_id>
//
// Database: NETLIFY_DB_URL if set (copy the production connection string from the Netlify
// UI; Team Owner only), otherwise the local `netlify dev` database.

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import pg from "pg";
import { hashAccessId, normalizeAccessId } from "../netlify/lib/auth.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    role: { type: "string" },
    backup: { type: "boolean", default: false },
  },
});
const [command, userId] = positionals;

function connectionString() {
  // pg already treats sslmode=require as verify-full and warns about it; ask for verify-full outright.
  if (process.env.NETLIFY_DB_URL) return process.env.NETLIFY_DB_URL.replace("sslmode=require", "sslmode=verify-full");
  const out = execFileSync("npx", ["netlify", "database", "connect", "--json"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(out.slice(out.indexOf("{"))).connection_string;
}

// Reads a line without echoing it. One reader serves every prompt, so piped input
// (one value per line) works too.
let reader;
let lines;
async function promptHidden(question) {
  if (!reader) {
    reader = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
    reader._writeToOutput = () => {};
    lines = reader[Symbol.asyncIterator]();
  }
  process.stdout.write(question);
  const { value = "" } = await lines.next();
  process.stdout.write("\n");
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const client = new pg.Client({ connectionString: connectionString() });
await client.connect();

try {
  switch (command) {
    case "list": {
      const { rows } = await client.query(`
        SELECT user_id, display_name, role, can_backup, active, access_id_hash IS NOT NULL AS has_access_id
        FROM users ORDER BY user_id`);
      console.table(rows);
      break;
    }
    case "set": {
      if (!userId || !/^[a-z][a-z0-9_]*$/.test(userId)) fail("Give a lowercase user_id, e.g. malak");
      if (!values.name) fail("Give --name");
      if (!["admin", "editor"].includes(values.role)) fail("Give --role admin or --role editor");
      const accessId = normalizeAccessId(await promptHidden(`Access ID for ${userId}: `));
      if (!accessId) fail("No access ID entered; nothing changed");
      const confirm = normalizeAccessId(await promptHidden("Type it again: "));
      if (confirm !== accessId) fail("The two entries differ; nothing changed");
      await client.query(
        `INSERT INTO users (user_id, display_name, role, can_backup, access_id_hash, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (user_id) DO UPDATE SET display_name = $2, role = $3, can_backup = $4,
           access_id_hash = $5, active = true`,
        [userId, values.name, values.role, values.backup, await hashAccessId(accessId)],
      );
      console.log(`Saved ${userId} (${values.role}${values.backup ? ", backups" : ""}).`);
      break;
    }
    case "revoke":
    case "restore": {
      const active = command === "restore";
      const { rowCount } = await client.query(`UPDATE users SET active = $2 WHERE user_id = $1`, [userId, active]);
      if (!rowCount) fail(`No user ${userId}`);
      if (!active) {
        await client.query(
          `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      }
      console.log(`${userId} ${active ? "can sign in again" : "is signed out and cannot sign in"}.`);
      break;
    }
    default:
      fail("Usage: node scripts/users.mjs list | set <user_id> --name <name> --role admin|editor [--backup] | revoke <user_id> | restore <user_id>");
  }
} finally {
  reader?.close();
  await client.end();
}
