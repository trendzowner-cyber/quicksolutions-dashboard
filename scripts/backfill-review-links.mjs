// One-time backfill 2026-10-20 (owner: "fix the links"): fetch Outscraper's
// newest 100 reviews ONCE (~100 credits, budget-safe) and adopt review_link
// onto every row that matches by reviewerName|comment but has no link yet.
// This closes the gap for the deck reviews Google's API imported without
// links. Going forward the /api/reviews/[id]/link route resolves brand-new
// reviews live.
//
// Run: node scripts/backfill-review-links.mjs

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const OUTSCRAPER_BASE = "https://api.app.outscraper.com";
const API_KEY = process.env.OUTSCRAPER_API_KEY;
const QUERY = process.env.OUTSCRAPER_QUERY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchReviews() {
  const url = new URL(`${OUTSCRAPER_BASE}/maps/reviews-v3`);
  url.searchParams.set("query", QUERY);
  url.searchParams.set("reviewsLimit", "30");
  url.searchParams.set("sort", "newest");
  url.searchParams.set("region", "be");
  const res = await fetch(url.toString(), { headers: { "X-API-KEY": API_KEY } });
  if (!res.ok) throw new Error(`Outscraper error ${res.status}`);
  let json = await res.json();
  // Async: poll the task until it completes (result is read-once).
  for (let i = 0; i < 40 && (json.status === "Pending" || json.status === "In Progress"); i++) {
    await sleep(2500);
    const poll = await fetch(`${OUTSCRAPER_BASE}/requests/${json.id}`, {
      headers: { "X-API-KEY": API_KEY },
    });
    if (!poll.ok) throw new Error(`Poll error ${poll.status}`);
    json = await poll.json();
  }
  if (json.status !== "Success") throw new Error(`Task not done: ${json.status}`);
  return json.data?.[0]?.reviews_data ?? [];
}

// Text can NEVER match: Google's API returns "(Translated by Google) …"
// comments while Outscraper has the original. Name + date does the work —
// Google's createTime is canonical in both sources.
const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// "MM/DD/YYYY HH:MM:SS" (US order, UTC) → epoch ms
function parseOutscraperDate(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s ?? "");
  if (!m) return 0;
  return Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const reviews = await fetchReviews();
  console.log(`fetched ${reviews.length} reviews from Outscraper`);

  const rows = await client.query(
    'SELECT id, "reviewerName", "createTime", "reviewUrl" FROM "GoogleReview" WHERE "reviewUrl" IS NULL AND status = \'active\''
  );

  let adopted = 0;
  for (const r of reviews) {
    const link = r.review_link ? String(r.review_link).slice(0, 500) : null;
    if (!link) continue;
    const name = norm(r.author_title);
    const t = parseOutscraperDate(r.review_datetime_utc);
    const row = rows.rows.find((db) => {
      if (norm(db.reviewerName) !== name) return false;
      const dt = db.createTime ? new Date(db.createTime).getTime() : 0;
      if (t > 0 && dt > 0) return Math.abs(t - dt) <= 2 * 86400000; // ±2 days
      return !db.reviewUrl; // no date on either side — name-only
    });
    if (!row) continue;
    await client.query('UPDATE "GoogleReview" SET "reviewUrl" = $1 WHERE id = $2', [link, row.id]);
    adopted++;
  }
  console.log(`adopted links onto ${adopted} rows`);

  const left = await client.query(
    'SELECT count(*)::int AS n FROM "GoogleReview" WHERE "reviewUrl" IS NULL AND status = \'active\' AND "starRating" <= 3'
  );
  console.log(`linkless deck reviews remaining: ${left.rows[0].n}`);
} catch (error) {
  console.error("Backfill failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
