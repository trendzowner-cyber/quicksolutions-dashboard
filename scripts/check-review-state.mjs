// Read-only prod checks: deck pool size, Google token state, last sync logs.
// Run: node scripts/check-review-state.mjs

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const unreportedBad = await client.query(
    `SELECT count(*)::int AS n FROM "GoogleReview" WHERE status = 'active' AND reported = false AND "starRating" <= 3`
  );
  const byRating = await client.query(
    `SELECT "starRating", count(*)::int AS n FROM "GoogleReview" WHERE status = 'active' AND reported = false AND "starRating" <= 3 GROUP BY "starRating" ORDER BY "starRating"`
  );
  console.log("Unreported active <=3★ reviews (new deck pool):", unreportedBad.rows[0].n);
  console.log("  by rating:", JSON.stringify(byRating.rows));

  const token = await client.query(
    `SELECT id, scope, "expiresAt", "updatedAt" FROM "GoogleToken" LIMIT 5`
  );
  console.log("GoogleToken rows:", JSON.stringify(token.rows));

  const syncLog = await client.query(
    `SELECT status, "startedAt", "finishedAt", "newCount", error FROM "ReviewSyncLog" ORDER BY "startedAt" DESC LIMIT 5`
  );
  console.log("Last sync logs:");
  for (const row of syncLog.rows) console.log(" ", JSON.stringify(row));

  const assignments = await client.query(
    `SELECT status, count(*)::int AS n FROM "ReviewAssignment" WHERE "weekKey" = to_char(now(), 'IYYY-"W"IW') GROUP BY status`
  );
  console.log("This week's assignments:", JSON.stringify(assignments.rows));
} catch (error) {
  console.error("Failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
