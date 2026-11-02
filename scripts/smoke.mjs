// Calls /api/health on a running site and exits non-zero if any check failed.
// Usage: npm run smoke                       (local `netlify dev` on port 8888)
//        npm run smoke -- https://<site>.netlify.app

const base = (process.argv[2] ?? "http://localhost:8888").replace(/\/$/, "");
const res = await fetch(`${base}/api/health`);
const body = await res.json();

for (const check of body.checks) {
  console.log(`${check.status.toUpperCase().padEnd(8)} ${check.label} (${check.ms} ms)\n         ${check.detail}`);
}

const robots = await fetch(`${base}/robots.txt`);
const tag = robots.headers.get("x-robots-tag") ?? "";
const blocked = tag.includes("noindex");
console.log(`${blocked ? "PASS" : "FAIL"}     Search engines blocked\n         X-Robots-Tag: ${tag || "(missing)"}`);

console.log(`\n${base}: ${body.ok && blocked ? "OK" : "FAILED"} (HTTP ${res.status})`);
process.exit(body.ok && blocked ? 0 : 1);
