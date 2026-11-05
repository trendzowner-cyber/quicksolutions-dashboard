// Emergency repair 2026-10-19 (user-approved) — the first live GBP sync
// (connected account manages Bellalux Design, not QuickSolutions) imported
// the wrong business and marked ~220 QuickSolutions rows as "removed"
// because their synthetic ids (outscraper-/import-) never match real Google
// review ids.
//
// What this does (audit history stays untouched):
//  1. Pauses the qs-reviews-sync cron while the repair runs.
//  2. Restores every row falsely removed today (synthetic ids) → active,
//     and reverts the removalStage flip ('sent' → 'removed') for rows whose
//     sync log says they were "verzonden naar verwijderaar".
//  3. Deletes the Bellalux rows created today (accounts/... location).
//
// Run: node scripts/repair-gbp-sync-damage.mjs

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const TODAY = "2026-10-19T00:00:00Z";

try {
  await client.connect();

  // 1. Pause the sync cron — best effort: the app DB user may not have
  // rights on the cron schema, and the fixed code makes the cron harmless
  // anyway (non-QuickSolutions businesses are ignored entirely).
  try {
    const pause = await client.query(
      "UPDATE cron.job SET active = false WHERE jobname = 'qs-reviews-sync' RETURNING jobid"
    );
    console.log("cron paused:", pause.rowCount > 0 ? "yes" : "NOT FOUND");
  } catch (e) {
    console.log("cron pause skipped (no rights on cron schema):", e.message);
  }

  // 2. Restore false removals (synthetic ids removed today).
  const restored = await client.query(`
    UPDATE "GoogleReview"
    SET status = 'active', "removedAt" = NULL
    WHERE status = 'removed'
      AND "removedAt" >= '${TODAY}'
      AND ("googleReviewId" LIKE 'outscraper-%' OR "googleReviewId" LIKE 'import-%')
    RETURNING id
  `);
  console.log("restored to active:", restored.rowCount);

  // Revert the removalStage flip for rows whose false-removal log says they
  // were sent to the remover.
  const stages = await client.query(`
    UPDATE "GoogleReview" r
    SET "removalStage" = 'sent'
    FROM "ReviewAction" a
    WHERE a."reviewId" = r.id
      AND a.action = 'removed'
      AND a."createdAt" >= '${TODAY}'
      AND a.detail LIKE '%verzonden naar verwijderaar%'
      AND r."removalStage" = 'removed'
    RETURNING r.id
  `);
  console.log("removalStage reverted to 'sent':", stages.rowCount);

  // 3. Delete Bellalux rows (GBP account/location ids). The GoogleReview
  // table has no createdAt — but every pre-existing QuickSolutions row
  // carries a places/... location, so any accounts/... row is from today's
  // wrong-business import.
  const bellalux = await client.query(`
    DELETE FROM "GoogleReview"
    WHERE "locationName" LIKE 'accounts/%'
    RETURNING id
  `);
  console.log("Bellalux rows deleted:", bellalux.rowCount);

  // 4. Final state.
  const state = await client.query(
    'SELECT status, count(*)::int AS n FROM "GoogleReview" GROUP BY status'
  );
  console.log("final state:", JSON.stringify(state.rows));
  const bellaluxLeft = await client.query(
    `SELECT count(*)::int AS n FROM "GoogleReview" WHERE "locationName" LIKE 'accounts/%'`
  );
  console.log("GBP-location rows left:", bellaluxLeft.rows[0].n);
} catch (error) {
  console.error("Repair failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
