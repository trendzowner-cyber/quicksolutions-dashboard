// Probe: does the Google Ads refresh token still work? (read-only API call)
// Mirrors check-review-state.mjs connection style — no TLS flag needed.
// Run: node scripts/probe-ads-token.mjs
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const mask = (s) => (s ? `${s.slice(0, 8)}…${s.slice(-4)} (${s.length} chars)` : "(none)");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `SELECT "refreshToken", "updatedAt" FROM "GoogleToken" WHERE scope = 'adwords'`
);
await client.end();

const dbToken = rows[0]?.refreshToken ?? null;
console.log("DB adwords row     :", rows.length ? `yes, updated ${rows[0].updatedAt}` : "none");
console.log("  DB refreshToken  :", mask(dbToken));
console.log("env refreshToken   :", mask(process.env.GOOGLE_ADS_REFRESH_TOKEN));
console.log(
  "client id (.env.local):",
  mask(process.env.GOOGLE_ADS_CLIENT_ID),
  "| secret:",
  mask(process.env.GOOGLE_ADS_CLIENT_SECRET)
);

const candidates = [
  ["DB row", dbToken],
  ["env", process.env.GOOGLE_ADS_REFRESH_TOKEN],
].filter(([, t]) => !!t);

for (const [label, refreshToken] of candidates) {
  const ex = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!ex.ok) {
    const body = await ex.text();
    const kind = body.includes("invalid_grant") ? "invalid_grant (dead/revoked)" : body.slice(0, 200);
    console.log(`[${label}] exchange FAIL (${ex.status}): ${kind}`);
    continue;
  }
  const tok = await ex.json();
  const cleanId = process.env.GOOGLE_ADS_CUSTOMER_IDS.split(",")[0].replace(/-/g, "");
  const qr = await fetch(
    `https://googleads.googleapis.com/v23/customers/${cleanId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok.access_token}`,
        "developer-token": process.env.GOOGLE_ADS_DEV_TOKEN,
        "login-customer-id": "3073702998",
      },
      body: JSON.stringify({
        query: "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
      }),
    }
  );
  const qb = await qr.text();
  console.log(`[${label}] exchange OK -> query status ${qr.status}`);
  console.log(`  ${qb.slice(0, 400)}`);
}
process.exit(0);
