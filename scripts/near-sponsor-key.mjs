// Issues a sponsor key for the Quiet Hall MCP server (POST /api/near/sponsor-key, admin only).
// The admin key is read from the environment so it never lands in shell history:
//   CAMPAIGN_ADMIN_KEY=… node scripts/near-sponsor-key.mjs <baseUrl> "<sponsor label>"
// The sponsor key is printed ONCE (only its hash is stored). Hand it over privately; it goes in the x-api-key header.
const [BASE, sponsor] = process.argv.slice(2);
const admin = process.env.CAMPAIGN_ADMIN_KEY;
if (!BASE || !sponsor || !admin) {
  console.error('usage: CAMPAIGN_ADMIN_KEY=… node scripts/near-sponsor-key.mjs <baseUrl> "<sponsor label>"');
  process.exit(2);
}
const r = await fetch(`${BASE.replace(/\/$/, '')}/api/near/sponsor-key`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-key': admin },
  body: JSON.stringify({ sponsor }),
});
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.key) {
  console.error(`refused (${r.status}): ${j.error ?? 'no key'}`);
  process.exit(1);
}
console.log(`sponsor: ${j.sponsor}\nkey:     ${j.key}\n\nclaude mcp add --transport http quiet-hall ${BASE.replace(/\/$/, '')}/api/near/mcp --header "x-api-key: ${j.key}"`);
