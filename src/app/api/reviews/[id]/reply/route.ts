import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { replyToReview, deleteReviewReply, isGbpLocation } from "@/lib/google-business";
import { logReviewAction } from "@/lib/review-log";

// Can this row be posted to Google right now? The test is the location parent,
// not the id prefix: only a GBP sync writes the `accounts/{a}/locations/{l}`
// parent, and it writes it together with Google's own review id. Fallback rows
// (outscraper-/import-/manual-/places-) carry `places/{placeId}` or null, which
// the reviews endpoint does not know — replying to them was attempted before
// this check and came back as an HTML 404.
function pushable(review: { locationName: string | null }) {
  return isGbpLocation(review.locationName);
}

// POST { text } → posts the reply to Google; if Google is blocked (quota),
// saves it locally with replyPending so a later sync pushes it live.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { text } = await request.json();
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Reply tekst ontbreekt" }, { status: 400 });
  }

  const review = await db.googleReview.findUnique({ where: { id } });
  if (!review) {
    return NextResponse.json({ error: "Review niet gevonden" }, { status: 404 });
  }

  let googleOk = false;
  if (pushable(review)) {
    try {
      await replyToReview(review.locationName!, review.googleReviewId, text.trim());
      googleOk = true;
    } catch {
      // Quota or transient failure — save locally, push on a later sync.
    }
  }

  const updated = await db.googleReview.update({
    where: { id },
    data: { replyText: text.trim(), repliedAt: new Date(), replyPending: !googleOk },
  });
  await logReviewAction(id, "reply_posted", {
    detail:
      (googleOk ? "" : "opgeslagen, nog niet live op Google — ") + text.trim().slice(0, 120),
    actorId: request.headers.get("x-user-id") ?? "dashboard",
  });
  return NextResponse.json({ review: updated, google: googleOk });
}

// DELETE → removes the reply from Google and clears the local copy.
export async function DELETE(
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

  if (pushable(review)) {
    try {
      await deleteReviewReply(review.locationName!, review.googleReviewId);
    } catch {
      // Blocked — local copy is cleared regardless; Google keeps the reply
      // until the next sync retry sees it. Best effort.
    }
  }

  const updated = await db.googleReview.update({
    where: { id },
    data: { replyText: null, repliedAt: null, replyPending: false },
  });
  await logReviewAction(id, "reply_deleted", {
    actorId: _request.headers.get("x-user-id") ?? "dashboard",
  });
  return NextResponse.json({ review: updated });
}
