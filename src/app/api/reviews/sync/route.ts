import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { listLocations, listReviews, replyToReview, getGoogleAuthState, isGbpLocation } from "@/lib/google-business";
import { scoreAndAlert } from "@/lib/review-ai";
import { logReviewAction } from "@/lib/review-log";
import { sendTelegram } from "@/lib/telegram";
import { alertNewReview } from "@/lib/review-alert";
import {
  placesConfigured,
  fetchPlaceDetails,
  fetchPlaceRating,
} from "@/lib/google-places";
import { outscraperConfigured, fetchOutscraperReviews } from "@/lib/outscraper";
import { AUTO_THANKS } from "@/lib/reply-templates";

// Called by Supabase pg_cron (qs-reviews-sync) every 15 minutes with
// header X-Sync-Secret = REVIEWS_SYNC_SECRET. Also callable manually.
//
// Data sources:
//  1. Business Profile API — full list + reply posting (needs approval,
//     currently quota-blocked: "Accounts API error 429").
//  2. Places API (New) — real Google rating + latest ~5 reviews. Runs every
//     sync: a cheap userRatingCount read is the tripwire, and the expensive
//     `reviews` fetch only fires once that count actually moves. (Needs
//     GOOGLE_MAPS_API_KEY + GOOGLE_PLACE_ID.)
//  3. Outscraper fallback — the only source that needs no Google billing.
//     Newest 3 every 6h via OutscraperSync.updatedAt. Billing is per returned
//     review and the whole batch bills, so the budget is exactly cadence ×
//     limit: 4 polls/day × 3 = 360 of the 500 free reviews/month. This
//     constant is the tuning knob — halving it doubles the spend, and the
//     500/month cap is a hard stop, not a soft one.

const OUTSCRAPER_THROTTLE_MS = 6 * 3600 * 1000;

// Kill-switch (2026-10-19, owner): the auto-thanks BOT stays off — replies
// are employee-driven now (the positive-reviews section, with AI help). The
// queued-reply PUSH below is a different thing and stays ON: it is how
// employee-written replies that were saved while Google was unreachable go
// live on the next sync.
const AUTO_REPLY_ENABLED = false;

// Web push added per-review send time to the sync run — 60s ceiling keeps a
// burst of new reviews + notifications well inside Vercel's limits.
export const maxDuration = 60;

function placesKey(name: string, comment: string | null, rating: number): string {
  return createHash("md5").update(`${name}|${comment ?? ""}|${rating}`).digest("hex").slice(0, 12);
}

// Did the reviewer edit their text? Edits usually keep most of the original
// wording, so containment with a length floor is a safe signal.
function similarText(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return true;
  const shorter = x.length < y.length ? x : y;
  const longer = x.length < y.length ? y : x;
  if (shorter.length < 10) return false;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.5;
}

// Auto-thanks bot: reply to a fresh 4-5★ review. Posts to Google when this
// is a real GBP row; otherwise saves locally with replyPending and a later
// sync pushes it live.
async function autoThanks(
  reviewId: string,
  reviewerName: string,
  locationName: string | null,
  googleReviewId: string
) {
  const firstName = reviewerName.split(" ")[0] || reviewerName;
  const text = AUTO_THANKS.replace("{naam}", firstName);
  let pending = true;
  if (isGbpLocation(locationName)) {
    try {
      await replyToReview(locationName!, googleReviewId, text);
      pending = false;
    } catch {
      // Quota or transient — stays pending, pushed by a later sync.
    }
  }
  await db.googleReview.update({
    where: { id: reviewId },
    data: { replyText: text, repliedAt: new Date(), replyPending: pending },
  });
  await logReviewAction(reviewId, "auto_replied", {
    detail: "automatisch bedankt",
    actorId: "sync",
  });
}

export async function POST(request: Request) {
  // Auth: either the cron job's secret header, or a logged-in dashboard session.
  const secret = request.headers.get("x-sync-secret");
  const secretOk =
    !!process.env.REVIEWS_SYNC_SECRET && secret === process.env.REVIEWS_SYNC_SECRET;
  const sessionOk = await verifySession();
  if (!secretOk && !sessionOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log = await db.reviewSyncLog.create({ data: { status: "running" } });

  // Self-heal stuck rows: a run killed by the function timeout never reaches
  // the final update below and would show "running" forever in the health
  // panel. Anything still "running" from a previous run is dead by definition
  // (runs don't overlap) — mark it so the panel tells the truth.
  await db.reviewSyncLog
    .updateMany({
      where: { status: "running", id: { not: log.id } },
      data: { status: "error", error: "afgebroken (time-out)" },
    })
    .catch(() => {});

  // ── 1. Business Profile API (full sync — quota-gated until approval) ──
  let googleError: string | null = null;
  let gbpNew = 0;
  let removedCount = 0;
  const gbpKeys = new Set<string>(); // reviewerName|comment — for dedupe vs Places

  try {
    const authState = await getGoogleAuthState();
    const locations = (await listLocations()) ?? [];
    // The connected account can manage several businesses — e.g. the owner's
    // own profile next to the client's. Only QuickSolutions reviews belong in
    // this dashboard, so the sync is scoped to the business by TITLE (the
    // location name carries no business identity). Without this, the first
    // live GBP run imported the wrong business and "removed" everything else.
    const qsLocations = locations.filter((l) => /quick\s*solutions/i.test(l.title));
    if (!locations || locations.length === 0) {
      // Distinguish "never connected" from "connection died" — they need
      // different actions (connect vs reconnect). The old catch-all
      // "Geen Google-token" made a revoked token look like a missing one,
      // so a dead integration looked identical to an unconfigured one.
      googleError =
        authState === "expired"
          ? "Google-token verlopen — opnieuw verbinden nodig"
          : authState === "none"
            ? "Geen Google-token"
            : "Geen Google-locaties gevonden";
    } else {
      const seen: string[] = [];

      // Fallback-sourced rows (CSV-import / Outscraper) indexed by content so
      // they can be merged into their real Google review (adopt the real id,
      // keep history/notes/outcome).
      const importRows = await db.googleReview.findMany({
        where: {
          OR: [
            { googleReviewId: { startsWith: "import-" } },
            { googleReviewId: { startsWith: "outscraper-" } },
          ],
        },
        select: { id: true, reviewerName: true, comment: true, reviewUrl: true },
      });
      const importByKey = new Map(
        importRows.map((r) => [`${r.reviewerName}|${r.comment}`, r])
      );

      // Public Maps links: GBP-API rows carry no URL, so adopt the exact
      // review link from a content-matching row (Outscraper review_link).
      const urlRows = await db.googleReview.findMany({
        where: { reviewUrl: { not: null } },
        select: { reviewerName: true, comment: true, reviewUrl: true },
      });
      const urlByKey = new Map(
        urlRows.map((r) => [`${r.reviewerName}|${r.comment}`, r.reviewUrl])
      );

      // Preload every tracked row that carries a real Google review id. The hot
      // loop below matches ~1500 fetched reviews against the table by id — a
      // findUnique per review is what pushed the sync past the function
      // timeout, so the whole table comes down in one query instead.
      const trackedByGid = new Map(
        (
          await db.googleReview.findMany({
            where: {
              NOT: [
                { googleReviewId: { startsWith: "outscraper-" } },
                { googleReviewId: { startsWith: "import-" } },
                { googleReviewId: { startsWith: "manual-" } },
                { googleReviewId: { startsWith: "places-" } },
              ],
            },
            select: {
              id: true,
              googleReviewId: true,
              status: true,
              reviewerName: true,
              comment: true,
              starRating: true,
              reviewUrl: true,
              removalStage: true,
              cameBackCount: true,
              editCount: true,
            },
          })
        ).map((row) => [row.googleReviewId, row])
      );

      // The sweep is capped at the newest 2 pages (100 reviews): going
      // forward only NEW reviews matter, and the full ~1500-review pagination
      // pushed the sync past the function timeout. The removal snapshot below
      // only runs when a location was fetched COMPLETELY — a capped `seen`
      // must never judge old rows.
      // Newest review we already track. The create branch below only fires for
      // reviews NEWER than this — the first live GBP runs imported the whole
      // recent window as "new" (123 rows), which the owner does not want:
      // going forward only genuinely new reviews enter the dashboard.
      const newestTracked = (
        await db.googleReview.findFirst({
          where: { status: "active" },
          orderBy: { createTime: "desc" },
          select: { createTime: true },
        })
      )?.createTime;

      let fetchedComplete = false;
      // Slow per-new-review work (AI scoring, auto-thanks, Telegram, push)
      // runs in PARALLEL after the loop — awaited sequentially, a burst of
      // N new reviews was N × ~10s of DeepSeek latency, which is what pushed
      // the sync past the function timeout.
      const newReviewJobs: Promise<void>[] = [];
      for (const loc of qsLocations) {
        const { reviews, complete } = await listReviews(loc.locationName, 2);
        fetchedComplete = fetchedComplete || complete;
        for (const r of reviews) {
          seen.push(r.reviewId);
          const comment = r.comment ?? null;
          const rating = Number(r.starRating) || 0;
          const contentKey = `${r.reviewer?.displayName ?? "Anoniem"}|${comment}`;
          gbpKeys.add(contentKey);
          const adoptedUrl =
            importByKey.get(contentKey)?.reviewUrl ?? urlByKey.get(contentKey) ?? null;
          const base = {
            locationName: loc.locationName,
            reviewerName: r.reviewer?.displayName ?? "Anoniem",
            starRating: rating,
            comment,
            createTime: r.createTime ? new Date(r.createTime) : null,
            updateTime: r.updateTime ? new Date(r.updateTime) : null,
            lastSeenAt: new Date(),
          };

          // Merge a CSV-import row into its real Google review.
          const importRow = importByKey.get(contentKey);
          if (importRow) {
            const realRow = await db.googleReview.findUnique({
              where: { googleReviewId: r.reviewId },
            });
            if (realRow) {
              await db.googleReview.delete({ where: { id: importRow.id } });
              // Real row already exists — hand it the public link if it lacks one.
              if (adoptedUrl && !realRow.reviewUrl) {
                await db.googleReview.update({
                  where: { googleReviewId: r.reviewId },
                  data: { reviewUrl: adoptedUrl },
                });
              }
            } else {
              await db.googleReview.update({
                where: { id: importRow.id },
                data: { googleReviewId: r.reviewId, ...base, reviewUrl: adoptedUrl ?? undefined },
              });
              await logReviewAction(importRow.id, "merged", {
                detail: "CSV-import gekoppeld aan Google-review",
                actorId: "sync",
              });
            }
            importByKey.delete(contentKey);
            continue;
          }

          const existing = trackedByGid.get(r.reviewId) ?? null;
          if (existing) {
            // A review we marked removed is back in Google's list — resurrect
            // it with its history intact and flag it as came back.
            const cameBack = existing.status === "removed";
            // Attackers edit old reviews — Google re-dates them so they jump
            // back to the top. Detect any text/rating change and flag it.
            const edited =
              (r.comment ?? null) !== existing.comment ||
              rating !== existing.starRating;
            await db.googleReview.update({
              where: { googleReviewId: r.reviewId },
              data: {
                ...base,
                reviewUrl: adoptedUrl && !existing.reviewUrl ? adoptedUrl : undefined,
                ...(cameBack
                  ? {
                      status: "active",
                      removedAt: null,
                      removalStage:
                        existing.removalStage === "removed" ? "came_back" : existing.removalStage,
                      cameBackCount: existing.cameBackCount + 1,
                    }
                  : {}),
                ...(edited && !cameBack
                  ? { editedAt: new Date(), editCount: existing.editCount + 1 }
                  : {}),
              },
            });
            if (cameBack) {
              await logReviewAction(existing.id, "came_back", {
                detail: "weer op Google na verwijdering",
                actorId: "sync",
              });
              await sendTelegram(
                `⚠️ Review BACK on Google: ${existing.reviewerName} (${existing.starRating}★)`
              ).catch(() => {});
            } else if (edited) {
              await logReviewAction(existing.id, "edited", {
                detail: "tekst of score gewijzigd — staat weer bovenaan",
                actorId: "sync",
              });
              await sendTelegram(
                `✏️ Review EDITED back to the top: ${existing.reviewerName} (${rating}★)`
              ).catch(() => {});
            }
          } else if (
            !newestTracked ||
            !r.createTime ||
            new Date(r.createTime).getTime() > newestTracked.getTime()
          ) {
            const created = await db.googleReview.create({
              data: { googleReviewId: r.reviewId, ...base, reviewUrl: adoptedUrl ?? null },
            });
            gbpNew++;
            await logReviewAction(created.id, "created", { detail: "via sync", actorId: "sync" });
            newReviewJobs.push(
              (async () => {
                if (AUTO_REPLY_ENABLED && rating >= 4 && !created.replyText) {
                  await autoThanks(created.id, created.reviewerName, loc.locationName, r.reviewId).catch(() => {});
                }
                const fakeScore =
                  rating <= 3
                    ? await scoreAndAlert(r.reviewId, comment, rating).catch(() => null)
                    : null;
                await alertNewReview({
                  reviewerName: created.reviewerName,
                  starRating: rating,
                  comment,
                  reviewUrl: adoptedUrl ?? null,
                  source: "Business Profile API",
                  aiFakeScore: fakeScore,
                }).catch(() => {});
              })()
            );
          }
        }
      }
      await Promise.allSettled(newReviewJobs);

      // Push replies that were saved locally while Google posting was blocked
      // (quota). Whether a row is pushable is decided by isGbpLocation below —
      // one authority, so the DB-side prefilter only has to be cheap.
      const pendingReplies = await db.googleReview.findMany({
        where: { replyPending: true, replyText: { not: null } },
        select: { id: true, locationName: true, googleReviewId: true, replyText: true },
      });
      for (const p of pendingReplies) {
        if (!p.replyText || !isGbpLocation(p.locationName)) continue;
        try {
          await replyToReview(p.locationName!, p.googleReviewId, p.replyText);
          await db.googleReview.update({
            where: { id: p.id },
            data: { replyPending: false },
          });
        } catch {
          // Still blocked — stays pending for the next sync.
        }
      }

      // Snapshot logic: anything active that Google no longer returns was
      // removed. Only runs when a QuickSolutions location actually matched —
      // an empty `seen` (e.g. the connected account manages another business)
      // is evidence of nothing and must not nuke the table.
      //
      // Manual/Places rows never exist on Google; Outscraper/CSV rows are
      // content-verified via the merge path above, never ID-verified — their
      // synthetic ids can never match `seen`, and a non-matching one means
      // "edited or removed", which the Outscraper window path already judges.
      // So all four prefixes are excluded from GBP removal detection.
      if (qsLocations.length > 0 && fetchedComplete) {
        const toRemove = await db.googleReview.findMany({
          where: {
            status: "active",
            googleReviewId: { notIn: seen },
            NOT: [
              { googleReviewId: { startsWith: "manual-" } },
              { googleReviewId: { startsWith: "places-" } },
              { googleReviewId: { startsWith: "outscraper-" } },
              { googleReviewId: { startsWith: "import-" } },
            ],
          },
          select: { id: true, removalStage: true },
        });
        for (const r of toRemove) {
          await db.googleReview.update({
            where: { id: r.id },
            data: {
              status: "removed",
              removedAt: new Date(),
              removalStage: r.removalStage === "sent" ? "removed" : r.removalStage,
            },
          });
          await logReviewAction(r.id, "removed", {
            detail:
              r.removalStage === "sent"
                ? "niet meer op Google — was verzonden naar verwijderaar"
                : "niet meer op Google",
            actorId: "sync",
          });
        }
        removedCount = toRemove.length;
      }
    }
  } catch (error) {
    googleError = String(error);
  }

  // ── 2. Places API (New) — rating + latest ~5 reviews ──
  //
  // Two calls, not one. The cheap tripwire (rating + userRatingCount) runs on
  // every sync; the expensive fetch that includes `reviews` runs only once
  // that count has moved. Requesting `reviews` is what bills the
  // Enterprise+Atmosphere SKU, so keeping it off the frequent path is what
  // makes 15-minute polling affordable. It also catches deletions — a count
  // that falls means a review left Google, which the old time-throttled
  // version could not see at all.
  let placesNew = 0;
  let placesStatus: string | null = null;

  if (!placesConfigured()) {
    placesStatus = "niet geconfigureerd";
  } else {
    const placeId = process.env.GOOGLE_PLACE_ID!;
    try {
      const place = await db.googlePlace.findUnique({ where: { placeId } });
      const prevCount = place?.reviewCount ?? 0;
      const live = await fetchPlaceRating(placeId);

      if (place && place.reviewCount === live.reviewCount) {
        placesStatus = `onveranderd (${live.reviewCount ?? "?"} reviews)`;
      } else {
        const details = await fetchPlaceDetails(placeId);
        // First poll ever: the reviews already on the profile are not news.
        // Record them silently so the *next* arrival is the first alert.
        const baseline = !place;
        const seenKeys = new Set<string>();

        // The same review often reaches us from Outscraper (or a CSV import)
        // first. Those rows are keyed by content, not by a Google id, so
        // without this index the first Places run would file a second copy of
        // every review already in the table.
        const fallbackRows = await db.googleReview.findMany({
          where: {
            OR: [
              { googleReviewId: { startsWith: "outscraper-" } },
              { googleReviewId: { startsWith: "import-" } },
            ],
          },
          select: { id: true, reviewerName: true, comment: true, reviewUrl: true },
        });
        const fallbackByKey = new Map(
          fallbackRows.map((row) => [`${row.reviewerName}|${row.comment}`, row])
        );

        for (const r of details.reviews) {
          const contentKey = `${r.reviewerName}|${r.comment}`;
          seenKeys.add(contentKey);
          // Already known via the Business Profile API — this row is a dupe.
          if (gbpKeys.has(contentKey)) continue;

          const legacyId = `places-${placesKey(r.reviewerName, r.comment, r.starRating)}`;
          // Google's own resource name, stable across edits. The content hash
          // is only a fallback for the rare response that omits it.
          const stableId = r.reviewName ? `places-${r.reviewName}` : legacyId;

          // Resolve the row this review already lives in, most precise first:
          // the stable id, then this module's own legacy hash, then whatever
          // an Outscraper or import run stored for the same review. Narrowed
          // to the two columns the update below needs, so all three lookups
          // share one shape.
          let existing: { id: string; reviewUrl: string | null } | null =
            await db.googleReview.findUnique({
              where: { googleReviewId: stableId },
              select: { id: true, reviewUrl: true },
            });
          // Only a Places-keyed row gets migrated onto the stable id — a row
          // Outscraper owns keeps its id so its own edit-detection still
          // recognises it next run.
          let adoptStableId = false;
          if (!existing && stableId !== legacyId) {
            existing = await db.googleReview.findUnique({
              where: { googleReviewId: legacyId },
              select: { id: true, reviewUrl: true },
            });
            adoptStableId = !!existing;
          }
          if (!existing) {
            existing = fallbackByKey.get(contentKey) ?? null;
          }

          if (existing) {
            await db.googleReview.update({
              where: { id: existing.id },
              data: {
                // Adopting the stable id is what stops an edited review from
                // forking into a second row.
                ...(adoptStableId ? { googleReviewId: stableId } : {}),
                reviewerName: r.reviewerName,
                starRating: r.starRating,
                comment: r.comment,
                createTime: r.createTime ? new Date(r.createTime) : null,
                reviewUrl: r.reviewUrl ?? existing.reviewUrl,
                lastSeenAt: new Date(),
              },
            });
            if (adoptStableId) {
              await logReviewAction(existing.id, "merged", {
                detail: "stabiele review-id overgenomen",
                actorId: "sync",
              });
            }
          } else {
            const created = await db.googleReview.create({
              data: {
                googleReviewId: stableId,
                locationName: `places/${placeId}`,
                reviewerName: r.reviewerName,
                starRating: r.starRating,
                comment: r.comment,
                createTime: r.createTime ? new Date(r.createTime) : null,
                reviewUrl: r.reviewUrl,
                firstSeenAt: new Date(),
                lastSeenAt: new Date(),
                status: "active",
              },
            });
            placesNew++;
            await logReviewAction(created.id, "created", {
              detail: baseline ? "bestaande review (basislijn)" : "via Places API",
              actorId: "sync",
            });
            if (!baseline) {
              const fakeScore =
                r.starRating <= 3
                  ? await scoreAndAlert(stableId, r.comment, r.starRating).catch(() => null)
                  : null;
              await alertNewReview({
                reviewerName: r.reviewerName,
                starRating: r.starRating,
                comment: r.comment,
                reviewUrl: r.reviewUrl,
                source: "Places API",
                aiFakeScore: fakeScore,
              }).catch(() => {});
            }
          }
        }

        // A count that fell means reviews left Google. Only rows inside the
        // window this fetch actually covers can be judged — an older
        // `places-` row is simply not returned by a newest-5 fetch, which is
        // not the same thing as having been deleted.
        const windowTimes = details.reviews
          .map((r) => (r.createTime ? new Date(r.createTime).getTime() : NaN))
          .filter((t) => !Number.isNaN(t));

        if (!baseline && windowTimes.length > 0 && (live.reviewCount ?? 0) < prevCount) {
          const oldest = new Date(Math.min(...windowTimes));
          const activeRows = await db.googleReview.findMany({
            where: {
              status: "active",
              googleReviewId: { startsWith: "places-" },
              createTime: { gte: oldest },
            },
            select: { id: true, reviewerName: true, comment: true, removalStage: true },
          });
          for (const row of activeRows) {
            if (seenKeys.has(`${row.reviewerName}|${row.comment}`)) continue;
            await db.googleReview.update({
              where: { id: row.id },
              data: {
                status: "removed",
                removedAt: new Date(),
                removalStage: row.removalStage === "sent" ? "removed" : row.removalStage,
              },
            });
            await logReviewAction(row.id, "removed", {
              detail: "niet meer op Google (aantal daalde)",
              actorId: "sync",
            });
            await sendTelegram(
              `🗑️ Review GONE from Google: ${row.reviewerName}`
            ).catch(() => {});
            removedCount += 1;
          }
        }

        // Drop Places rows that are now duplicated by real GBP rows.
        if (gbpKeys.size > 0) {
          const dupes = await db.googleReview.findMany({
            where: { googleReviewId: { startsWith: "places-" } },
            select: { id: true, reviewerName: true, comment: true },
          });
          const dupeIds = dupes
            .filter((d) => gbpKeys.has(`${d.reviewerName}|${d.comment}`))
            .map((d) => d.id);
          if (dupeIds.length > 0) {
            await db.googleReview.deleteMany({ where: { id: { in: dupeIds } } });
          }
        }

        // Written last: reviewCount is the tripwire the next run compares
        // against, so it must only move once the run has fully succeeded.
        await db.googlePlace.upsert({
          where: { placeId },
          create: {
            placeId,
            displayName: details.displayName,
            rating: details.rating,
            reviewCount: details.reviewCount,
            mapsUri: details.mapsUri,
          },
          update: {
            displayName: details.displayName,
            rating: details.rating,
            reviewCount: details.reviewCount,
            mapsUri: details.mapsUri,
          },
        });

        placesStatus = baseline
          ? `basislijn (${details.reviews.length} reviews)`
          : `ok (${details.reviews.length} reviews)`;
      }
    } catch (error) {
      placesStatus = String(error);
    }
  }

  // ── 3. Outscraper fallback — FULL review list (free tier, no approval) ──
  let outscraperNew = 0;
  let outscraperStatus: string | null = null;

  if (!outscraperConfigured()) {
    outscraperStatus = "niet geconfigureerd";
  } else {
    try {
      const state = await db.outscraperSync.findUnique({ where: { id: "main" } });
      const fresh =
        !state ||
        !state.updatedAt ||
        Date.now() - state.updatedAt.getTime() > OUTSCRAPER_THROTTLE_MS;
      if (!fresh) {
        outscraperStatus = "throttled (6u)";
      } else {
        const result = await fetchOutscraperReviews(process.env.OUTSCRAPER_QUERY!);
        if (result.pending) {
          // Task didn't finish within the poll window. Its result is
          // read-once, so don't try to continue it next run — a fresh task
          // will be created when the throttle allows.
          outscraperStatus = "timeout (volgende sync probeert opnieuw)";
        } else {
          const data = result.data;

          await db.outscraperSync.upsert({
          where: { id: "main" },
          create: {
            placeId: data.placeId,
            placeName: data.placeName,
            rating: data.rating,
            reviewCount: data.reviewCount,
          },
          update: {
            placeId: data.placeId,
            placeName: data.placeName,
            rating: data.rating,
            reviewCount: data.reviewCount,
          },
        });

        // Light up the Google-score stat card with the real rating/count.
        if (data.placeId) {
          await db.googlePlace.upsert({
            where: { placeId: data.placeId },
            create: {
              placeId: data.placeId,
              displayName: data.placeName,
              rating: data.rating,
              reviewCount: data.reviewCount,
              mapsUri: data.placeId
                ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${data.placeId}`
                : null,
            },
            update: {
              displayName: data.placeName,
              rating: data.rating,
              reviewCount: data.reviewCount,
              mapsUri: data.placeId
                ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${data.placeId}`
                : null,
            },
          });
        }

        // All fallback rows indexed by content fingerprint — dedupe across
        // sources AND come-back detection (removed rows matching again).
        const fallbackRows = await db.googleReview.findMany({
          where: {
            OR: [
              { googleReviewId: { startsWith: "import-" } },
              { googleReviewId: { startsWith: "places-" } },
              { googleReviewId: { startsWith: "outscraper-" } },
            ],
          },
          select: {
            id: true,
            reviewerName: true,
            comment: true,
            starRating: true,
            status: true,
            removalStage: true,
            cameBackCount: true,
            editCount: true,
          },
        });
        const fallbackByKey = new Map(
          fallbackRows.map((r) => [`${r.reviewerName}|${r.comment}`, r])
        );
        // Edits change the fingerprint, so keep a per-name index for the
        // fuzzy match below.
        const fallbackByName = new Map<string, typeof fallbackRows>();
        for (const r of fallbackRows) {
          const list = fallbackByName.get(r.reviewerName) ?? [];
          list.push(r);
          fallbackByName.set(r.reviewerName, list);
        }

        for (const r of data.reviews) {
          const key = `${r.reviewerName}|${r.comment}`;
          if (gbpKeys.has(key)) continue;
          let prev = fallbackByKey.get(key);

          // Exact key missed but same author with heavily overlapping text →
          // the reviewer EDITED the review (Google re-dates it to the top).
          let sim = null as (typeof fallbackRows)[number] | null;
          if (!prev && r.comment) {
            sim =
              (fallbackByName.get(r.reviewerName) ?? []).find(
                (p) => similarText(p.comment, r.comment)
              ) ?? null;
          }
          if (sim) {
            const wasRemoved = sim.status === "removed";
            await db.googleReview.update({
              where: { id: sim.id },
              data: {
                comment: r.comment,
                starRating: r.starRating,
                editedAt: new Date(),
                editCount: sim.editCount + 1,
                lastSeenAt: new Date(),
                reviewUrl: r.reviewUrl,
                ...(wasRemoved
                  ? {
                      status: "active",
                      removedAt: null,
                      removalStage: sim.removalStage === "removed" ? "came_back" : sim.removalStage,
                      cameBackCount: sim.cameBackCount + 1,
                    }
                  : {}),
              },
            });
            await logReviewAction(sim.id, "edited", {
              detail: wasRemoved
                ? "tekst gewijzigd EN terug op Google"
                : "tekst gewijzigd — staat weer bovenaan",
              actorId: "sync",
            });
            await sendTelegram(
              `✏️ Review EDITED${wasRemoved ? " and BACK" : ""} on Google: ${r.reviewerName} (${r.starRating}★)`
            ).catch(() => {});
            continue;
          }

          // A review we marked removed is back on Google — resurrect it with
          // its history intact and flag it (the paid removal has to redo it).
          if (prev && prev.status === "removed") {
            await db.googleReview.update({
              where: { id: prev.id },
              data: {
                status: "active",
                removedAt: null,
                lastSeenAt: new Date(),
                starRating: r.starRating,
                createTime: r.createTime ? new Date(r.createTime) : null,
                reviewUrl: r.reviewUrl,
                removalStage: prev.removalStage === "removed" ? "came_back" : prev.removalStage,
                cameBackCount: prev.cameBackCount + 1,
              },
            });
            await logReviewAction(prev.id, "came_back", {
              detail: "weer op Google na verwijdering",
              actorId: "sync",
            });
            await sendTelegram(
              `⚠️ Review BACK on Google: ${r.reviewerName} (${r.starRating}★)`
            ).catch(() => {});
            continue;
          }

          if (prev) {
            // Edited review? Attackers edit old reviews so Google re-dates
            // them and they jump back to the top — detect and flag it.
            const changes: string[] = [];
            if ((r.comment ?? null) !== (prev.comment ?? null)) changes.push("tekst gewijzigd");
            if (r.starRating !== prev.starRating)
              changes.push(`${prev.starRating}★ → ${r.starRating}★`);
            if (changes.length > 0) {
              await db.googleReview.update({
                where: { id: prev.id },
                data: {
                  comment: r.comment,
                  starRating: r.starRating,
                  editedAt: new Date(),
                  editCount: prev.editCount + 1,
                  lastSeenAt: new Date(),
                  reviewUrl: r.reviewUrl,
                },
              });
              await logReviewAction(prev.id, "edited", {
                detail: changes.join(", "),
                actorId: "sync",
              });
              await sendTelegram(
                `✏️ Review EDITED back to the top: ${r.reviewerName} (${r.starRating}★) — ${changes.join(", ")}`
              ).catch(() => {});
            } else {
              // Already known (active, unchanged) — just refresh the touch.
              await db.googleReview.update({
                where: { id: prev.id },
                data: { lastSeenAt: new Date(), reviewUrl: r.reviewUrl },
              });
            }
            continue;
          }

          const googleReviewId = `outscraper-${placesKey(r.reviewerName, r.comment, r.starRating)}`;
          const created = await db.googleReview.create({
            data: {
              googleReviewId,
              locationName: data.placeId ? `places/${data.placeId}` : null,
              reviewerName: r.reviewerName,
              starRating: r.starRating,
              comment: r.comment,
              createTime: r.createTime ? new Date(r.createTime) : null,
              reviewUrl: r.reviewUrl,
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              status: "active",
              // The business's own reply on Google, if any.
              replyText: r.ownerAnswer,
            },
          });
          outscraperNew++;
          await logReviewAction(created.id, "created", {
            detail: "via Outscraper",
            actorId: "sync",
          });
          if (AUTO_REPLY_ENABLED && r.starRating >= 4 && !r.ownerAnswer) {
            // Auto-thanks for happy customers (saved pending until GBP live).
            await autoThanks(created.id, r.reviewerName, data.placeId ? `places/${data.placeId}` : null, googleReviewId).catch(() => {});
          }
          const fakeScore =
            r.starRating <= 3
              ? await scoreAndAlert(googleReviewId, r.comment, r.starRating).catch(() => null)
              : null;
          await alertNewReview({
            reviewerName: r.reviewerName,
            starRating: r.starRating,
            comment: r.comment,
            reviewUrl: r.reviewUrl,
            source: "Outscraper",
            aiFakeScore: fakeScore,
          }).catch(() => {});
        }

        // Removal detection within the newest-10 window: an active profile
        // review with createTime >= the oldest fetched review that is absent
        // from this fetch has been removed from Google. (Older reviews sit
        // outside the window and can't be judged from this fetch alone.)
        const windowTimes = data.reviews
          .map((r) => (r.createTime ? new Date(r.createTime).getTime() : NaN))
          .filter((t) => !Number.isNaN(t));
        if (windowTimes.length > 0) {
          const oldest = Math.min(...windowTimes);
          const inWindow = await db.googleReview.findMany({
            where: {
              status: "active",
              createTime: { gte: new Date(oldest) },
              OR: [
                { googleReviewId: { startsWith: "outscraper-" } },
                { googleReviewId: { startsWith: "import-" } },
              ],
            },
            select: {
              id: true,
              reviewerName: true,
              comment: true,
              removalStage: true,
            },
          });
          const fetchedKeys = new Set(
            data.reviews.map((r) => `${r.reviewerName}|${r.comment}`)
          );
          const gone = inWindow.filter(
            (row) => !fetchedKeys.has(`${row.reviewerName}|${row.comment}`)
          );
          for (const row of gone) {
            await db.googleReview.update({
              where: { id: row.id },
              data: {
                status: "removed",
                removedAt: new Date(),
                removalStage: row.removalStage === "sent" ? "removed" : row.removalStage,
              },
            });
            await logReviewAction(row.id, "removed", {
              detail:
                row.removalStage === "sent"
                  ? "niet meer op Google — was verzonden naar verwijderaar"
                  : "niet meer op Google",
              actorId: "sync",
            });
            removedCount += 1;
          }
        }
        outscraperStatus = `ok (${data.reviews.length} reviews)`;
        }
      }
    } catch (error) {
      outscraperStatus = String(error);
    }
  }

  await db.reviewSyncLog.update({
    where: { id: log.id },
    data: {
      status: "success",
      finishedAt: new Date(),
      newCount: gbpNew + placesNew + outscraperNew,
      removedCount,
      error: googleError ? `GBP: ${googleError}` : null,
    },
  });

  // NOTE: keep googleError verbatim in the body — the session's approval
  // watcher greps for "Accounts API error 429" to detect quota approval.
  return NextResponse.json({
    ok: true,
    google: googleError ? { ok: false, error: googleError } : { ok: true },
    places: placesStatus,
    outscraper: outscraperStatus,
    newCount: gbpNew + placesNew + outscraperNew,
    removedCount,
  });
}
