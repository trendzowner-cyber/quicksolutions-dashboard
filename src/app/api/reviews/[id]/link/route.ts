// Resolve a working Google Maps link for one review — the "Open op Google"
// action. Stored permalinks redirect immediately. Brand-new GBP rows have no
// link (Google's API provides none), so a live Outscraper fetch resolves it
// on demand: a fresh review is inside the newest-few window Outscraper
// returns, and its review_link is the exact interactive URL.

import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchOutscraperReviews } from "@/lib/outscraper";
import { publicReviewLink, PUBLIC_REVIEWS_FALLBACK } from "@/lib/review-link";

// Outscraper's async API polls for up to ~a minute worst case.
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const review = await db.googleReview.findUnique({ where: { id } });
  if (!review) {
    return NextResponse.json({ error: "Review niet gevonden" }, { status: 404 });
  }

  if (review.reviewUrl) {
    return NextResponse.redirect(publicReviewLink(review.reviewUrl));
  }

  const created = review.createTime ? new Date(review.createTime).getTime() : 0;
  // Only reviews inside a limit-10 fetch window (≈ 3 weeks) can ever resolve
  // — older ones are not returned by Outscraper at all, so attempting would
  // burn credits for nothing. Older rows use the listing fallback.
  const isFresh = created > 0 && Date.now() - created < 21 * 86400000;
  if (isFresh) {
    try {
      const result = await fetchOutscraperReviews(process.env.OUTSCRAPER_QUERY || "", 10);
      if (!result.pending) {
        const key = `${review.reviewerName}|${review.comment ?? ""}`;
        const match = result.data.reviews.find(
          (r) => `${r.reviewerName}|${r.comment ?? ""}` === key && r.reviewUrl
        );
        if (match?.reviewUrl) {
          await db.googleReview.update({
            where: { id },
            data: { reviewUrl: match.reviewUrl },
          });
          // The fetch consumed Outscraper quota — count it as this cycle's
          // fetch so the 6h sync throttle measures from here (cost-neutral).
          await db.outscraperSync.upsert({
            where: { id: "main" },
            update: { updatedAt: new Date() },
            create: { id: "main", updatedAt: new Date() },
          });
          return NextResponse.redirect(publicReviewLink(match.reviewUrl));
        }
      }
    } catch {
      // Resolution failed — fall through to the listing link.
    }
  }
  return NextResponse.redirect(PUBLIC_REVIEWS_FALLBACK);
}
