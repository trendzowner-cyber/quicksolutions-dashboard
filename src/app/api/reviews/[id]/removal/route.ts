import { NextResponse } from "next/server";
import { verifySession, getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { logReviewAction } from "@/lib/review-log";

// Removal pipeline (the paid removal service):
//   ready → sent → removed (verified by sync) → paid
//   removed → came_back (sync detects it) → sent again (free rework)
const REMOVAL_DEADLINE_DAYS = 3;
const DEFAULT_REMOVAL_PRICE = 15;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json();
  const stage = String(body.stage ?? "");
  const actorId = request.headers.get("x-user-id") ?? "dashboard";

  // Sending to the removal service and marking paid is owner/admin work.
  if (stage === "send" || stage === "paid") {
    const user = await getSessionUser();
    if (!user || (user.role !== "owner" && user.role !== "admin")) {
      return NextResponse.json({ error: "Geen rechten voor deze actie" }, { status: 403 });
    }
  }

  const review = await db.googleReview.findUnique({ where: { id } });
  if (!review) {
    return NextResponse.json({ error: "Review niet gevonden" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  let action = "";
  let detail: string | null = null;

  if (stage === "ready") {
    if (review.status !== "active") {
      return NextResponse.json(
        { error: "Alleen actieve reviews kunnen naar verwijdering" },
        { status: 400 }
      );
    }
    data.removalStage = "ready";
    action = "removal_ready";
  } else if (stage === "send") {
    if (review.status !== "active") {
      return NextResponse.json(
        { error: "Alleen actieve reviews kunnen verzonden worden" },
        { status: 400 }
      );
    }
    const now = new Date();
    data.removalStage = "sent";
    data.sentToRemoverAt = now;
    data.removalDueAt = new Date(now.getTime() + REMOVAL_DEADLINE_DAYS * 86400000);
    // Explicit price (0 = free rework) or the default.
    data.removalPrice =
      body.price === undefined || body.price === "" || body.price === null
        ? DEFAULT_REMOVAL_PRICE
        : Math.max(0, Number(body.price) || 0);
    detail = `prijs €${data.removalPrice}`;
    action = "removal_sent";
  } else if (stage === "paid") {
    if (review.removalStage !== "removed") {
      return NextResponse.json(
        { error: "Alleen verwijderde reviews kunnen betaald worden" },
        { status: 400 }
      );
    }
    data.paidAt = new Date();
    action = "removal_paid";
  } else if (stage === "cancel") {
    data.removalStage = null;
    data.sentToRemoverAt = null;
    data.removalDueAt = null;
    data.removalPrice = null;
    data.paidAt = null;
    action = "removal_cancelled";
  } else {
    return NextResponse.json({ error: "Onbekende stage" }, { status: 400 });
  }

  const updated = await db.googleReview.update({ where: { id }, data });

  await logReviewAction(id, action, { detail, actorId });

  return NextResponse.json({ review: updated });
}
