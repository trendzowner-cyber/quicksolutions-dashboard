import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { scoreAndAlert } from "@/lib/review-ai";
import { logReviewAction } from "@/lib/review-log";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [reviews, stats, lastSync, place] = await Promise.all([
    db.googleReview.findMany({
      orderBy: [{ createTime: "desc" }, { firstSeenAt: "desc" }],
      take: 300,
    }),
    db.googleReview.groupBy({
      by: ["starRating", "status", "reported", "reportOutcome"],
      _count: { _all: true },
    }),
    db.reviewSyncLog.findFirst({ orderBy: { startedAt: "desc" } }),
    db.googlePlace.findFirst(),
  ]);

  const avg =
    reviews.length > 0
      ? Number(
          (
            reviews.reduce((s, r) => s + r.starRating, 0) / reviews.length
          ).toFixed(1)
        )
      : null;

  return NextResponse.json(
    { reviews, stats, avg, lastSync, place },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST → manually add a review (interim while Google API access is pending).
// The row gets an AI fake-score the same way synced reviews do.
export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const rating = Math.max(1, Math.min(5, Number(body.starRating) || 1));
  const comment = body.comment?.trim() || null;
  if (!comment && !body.reviewerName) {
    return NextResponse.json({ error: "Naam of tekst is verplicht" }, { status: 400 });
  }

  const review = await db.googleReview.create({
    data: {
      googleReviewId: `manual-${randomUUID()}`,
      reviewerName: body.reviewerName?.trim() || "Anoniem",
      starRating: rating,
      comment,
      reviewUrl: body.reviewUrl || null,
      createTime: new Date(),
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      status: "active",
    },
  });

  if (rating <= 3) {
    await scoreAndAlert(review.googleReviewId, comment, rating).catch(() => {});
  }

  await logReviewAction(review.id, "created", {
    detail: "handmatig toegevoegd",
    actorId: request.headers.get("x-user-id") ?? "dashboard",
  });

  return NextResponse.json({ review });
}
