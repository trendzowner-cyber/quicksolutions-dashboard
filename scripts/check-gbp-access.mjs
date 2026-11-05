// End-to-end check of the Google Business Profile (reviews) chain, after
// reconnecting Google in the dashboard.
//
// It walks the same three calls src/lib/google-business.ts makes, and builds
// the reviews parent the same way the library does (account-qualified) — a
// probe that joined them differently would reproduce the very bug this checks
// for.
//
// Run: node --env-file=.env.local scripts/check-gbp-access.mjs

import "dotenv/config";
import pg from "pg";

const SCOPE = "https://www.googleapis.com/auth/business.manage";
const V4 = "https://mybusiness.googleapis.com/v4";
const mask = (s) => (s ? `${s.slice(0, 8)}…${s.slice(-4)} (${s.length} chars)` : "(none)");

// ── token from DB, mirroring resolveToken() in google-business.ts ─────────
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rows } = await client.query(
  `SELECT "accessToken","refreshToken","expiresAt","updatedAt" FROM "GoogleToken" WHERE scope = $1`,
  [SCOPE]
);
await client.end();

if (!rows.length) {
  console.log(`NO TOKEN ROW for scope ${SCOPE}.`);
  console.log("=> Not connected. Click 'Google verbinden' on /dashboard/reviews first.");
  process.exit(1);
}

const row = rows[0];
console.log(`token stored      : ${row.updatedAt?.toISOString?.() ?? row.updatedAt}`);
console.log(`refresh token     : ${mask(row.refreshToken)}`);

let accessToken = row.accessToken;
if (new Date(row.expiresAt).getTime() <= Date.now() + 60_000) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken ?? "",
      client_id: process.env.GOOGLE_GBP_CLIENT_ID,
      client_secret: process.env.GOOGLE_GBP_CLIENT_SECRET,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.log(`\nRefresh FAILED: ${body.error} — ${body.error_description}`);
    console.log(
      "=> invalid_grant. If this happens ~7 days after connecting, the OAuth app is\n" +
        "   still in Testing mode: publish it (Google Auth Platform -> Audience -> Publish app)."
    );
    process.exit(1);
  }
  accessToken = body.access_token;
  console.log("refreshed         : OK\n");
} else {
  console.log("access token      : still valid\n");
}

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { html: text.slice(0, 150).replace(/\s+/g, " ") };
  }
  console.log(`  HTTP ${res.status}  ${url}`);
  if (body.error) console.log(`    ${body.error.status ?? ""} ${body.error.message ?? ""}`.trim());
  for (const d of body.error?.details ?? [])
    for (const e of d.errors ?? [])
      console.log(`    code: ${Object.values(e.errorCode ?? {})[0] ?? d["@type"]}`);
  if (body.html) console.log(`    HTML (unmatched path, not an API error): ${body.html}`);
  return { status: res.status, body };
}

console.log("1. accounts");
const accts = await get("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20");
const accounts = accts.body.accounts ?? [];

if (!accounts.length) {
  console.log("\nSTOP: no accounts returned — cannot go further.");
  process.exit(accts.status === 200 ? 0 : 2);
}

for (const acct of accounts) {
  console.log(`\n   ${acct.name}  ${acct.accountName ?? ""}`);

  console.log("2. locations");
  const locs = await get(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title&pageSize=100`
  );

  for (const loc of locs.body.locations ?? []) {
    // Business Information returns `locations/{id}`; the v4 API needs the
    // account-qualified parent. Same join as listLocations().
    const parent = `${acct.name}/${loc.name}`;
    console.log(`\n   location: ${loc.title ?? "—"}`);
    console.log(`   stored locationName: ${parent}`);
    const parentOk = /^accounts\/[^/]+\/locations\/[^/]+$/.test(parent);
    console.log(`   passes isGbpLocation(): ${parentOk ? "yes" : "NO — replies will be refused"}`);

    console.log("3. reviews");
    const revs = await get(`${V4}/${parent}/reviews?pageSize=50`);
    if (revs.status === 200) {
      console.log(
        `    OK — ${(revs.body.reviews ?? []).length} review(s), averageRating=${revs.body.averageRating ?? "—"}, total=${revs.body.totalReviewCount ?? "—"}`
      );
    }
  }
}

console.log("\nDone. A 200 on step 3 means the chain is live and the queued replies will flush on the next sync.");
