import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { logReviewAction } from "@/lib/review-log";
import { currentWeekKey } from "@/lib/review-groups";

const FOLLOWUP_DAYS = 3;

// PATCH: report tracking, outcome, notes, follow-up. Every change is logged
// to ReviewAction so the team can see who did what when.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json();
  const actorId = request.headers.get("x-user-id") ?? "dashboard";

  const before = await db.googleReview.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "Review niet gevonden" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.reported !== undefined) {
    const now = new Date();
    data.reported = !!body.reported;
    data.reportedAt = body.reported ? now : null;
    if (body.reported) {
      if (!before.reported) {
        data.reportCount = before.reportCount + 1;
      }
      if (body.reportOutcome === undefined && !before.reportOutcome) {
        data.reportOutcome = "pending";
      }
      // First check-back lands FOLLOWUP_DAYS after the report.
      data.followUpAt = new Date(now.getTime() + FOLLOWUP_DAYS * 86400000);
      if (body.reportedBy === undefined) {
        data.reportedBy = actorId;
      }
    } else {
      data.followUpAt = null;
      if (body.reportOutcome === undefined) {
        data.reportOutcome = null;
      }
    }
    // First report → auto-create a task linked to this review so the team
    // member sees it in their task list (assignable there like any task).
    if (body.reported && !before.reported) {
      db.task
        .create({
          data: {
            title: `Review: ${before.reviewerName} (${before.starRating}★)`,
            description: before.comment?.slice(0, 200) ?? "Gerapporteerde review opvolgen",
            category: "reviews",
            status: "todo",
            date: now.toISOString().slice(0, 10),
            dueDate: new Date(now.getTime() + FOLLOWUP_DAYS * 86400000)
              .toISOString()
              .slice(0, 10),
            relatedEntityType: "review",
            relatedEntityId: id,
          },
        })
        .then(() => logReviewAction(id, "task_created", { actorId }))
        .catch(() => {}); // task creation must never block the report
    }
  }
  if (body.reportOutcome !== undefined) {
    data.reportOutcome = body.reportOutcome;
    // Resolved outcomes need no follow-up reminder anymore.
    if (body.reportOutcome !== "pending") data.followUpAt = null;
  }
  // followup: true → "opnieuw gecontroleerd", next check in FOLLOWUP_DAYS; false → clear.
  if (body.followup !== undefined) {
    data.followUpAt = body.followup
      ? new Date(Date.now() + FOLLOWUP_DAYS * 86400000)
      : null;
  }
  if (body.notes !== undefined) data.notes = body.notes;
  // Fight dossier: why reported, Google case number, escalation.
  if (body.reportReason !== undefined) data.reportReason = body.reportReason || null;
  if (body.reportCaseId !== undefined) {
    data.reportCaseId = body.reportCaseId || null;
    if ((body.reportCaseId || null) !== (before.reportCaseId ?? null)) {
      await logReviewAction(id, "case_set", {
        detail: body.reportCaseId || "case verwijderd",
        actorId,
      });
    }
  }
  if (body.escalated !== undefined) {
    data.escalatedAt = body.escalated ? new Date() : null;
    if (body.escalated) await logReviewAction(id, "escalated", { actorId });
  }

  const review = await db.googleReview.update({ where: { id }, data });

  // Report ledger: whoever reports gets the done row this week, so their
  // "Gerapporteerd" tab and the team overview credit them. One row per review
  // per week (unique constraint) — a re-report just re-homes the row.
  if (body.reported && !before.reported) {
    const now = new Date();
    const weekKey = currentWeekKey(now);
    const reporterGroup = (
      await db.user.findUnique({ where: { id: actorId }, select: { groupId: true } })
    )?.groupId ?? null;
    const existing = await db.reviewAssignment.findUnique({
      where: { reviewId_weekKey: { reviewId: id, weekKey } },
    });
    if (existing) {
      await db.reviewAssignment.update({
        where: { id: existing.id },
        data: { userId: actorId, groupId: reporterGroup, status: "done", completedAt: now },
      });
    } else {
      await db.reviewAssignment.create({
        data: {
          reviewId: id,
          weekKey,
          userId: actorId,
          groupId: reporterGroup,
          status: "done",
          completedAt: now,
        },
      });
    }
  }

  // History
  if (body.reported !== undefined) {
    await logReviewAction(id, body.reported ? "reported" : "unreported", { actorId });
  }
  if (body.reportOutcome !== undefined && body.reportOutcome !== before.reportOutcome) {
    await logReviewAction(id, "outcome_set", {
      detail: String(body.reportOutcome),
      actorId,
    });
  }
  if (body.followup !== undefined && body.followup) {
    await logReviewAction(id, "followup_done", { actorId });
  }
  if (body.notes !== undefined && body.notes !== before.notes) {
    const note = (body.notes ?? "").trim();
    if (note) {
      await logReviewAction(id, "note_added", { detail: note.slice(0, 120), actorId });
    }
  }

  return NextResponse.json({ review });
}
