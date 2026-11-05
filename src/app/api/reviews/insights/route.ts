import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";

// GET → KPI dashboard + remover scorecard, computed server-side from the
// reviews table (no chart lib — the client renders plain bars).
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const dayAgo = new Date(Date.now() - 86400000);

  const [reviews, weekActions, users] = await Promise.all([
    db.googleReview.findMany({
      select: {
        starRating: true,
        createTime: true,
        status: true,
        reported: true,
        reportOutcome: true,
        aiFakeScore: true,
        replyText: true,
        removalStage: true,
        removalPrice: true,
        paidAt: true,
        cameBackCount: true,
        sentToRemoverAt: true,
        removedAt: true,
      },
    }),
    db.reviewAction.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { actorId: true, action: true },
    }),
    db.user.findMany({ select: { id: true, name: true, email: true } }),
  ]);

  const active = reviews.filter((r) => r.status === "active");
  const total = reviews.length;
  const avg = total
    ? Number((reviews.reduce((s, r) => s + r.starRating, 0) / total).toFixed(2))
    : null;

  // Weekly review velocity — last 8 weeks.
  const weeks: { label: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(Date.now() - i * 7 * 86400000);
    const start = new Date(end.getTime() - 7 * 86400000);
    weeks.push({
      label: start.toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit" }),
      count: reviews.filter((r) => r.createTime && r.createTime >= start && r.createTime < end).length,
    });
  }

  // Response rate + SLA (24h).
  const answered = active.filter((r) => r.replyText).length;
  const responseRate = active.length
    ? Math.round((answered / active.length) * 100)
    : null;
  const unanswered = active.filter((r) => !r.replyText);
  const overdueUnanswered = unanswered.filter(
    (r) => r.createTime && r.createTime.getTime() < Date.now() - 86400000
  ).length;

  // Report success.
  const reported = reviews.filter((r) => r.reported);
  const reportWon = reported.filter((r) => r.reportOutcome === "removed").length;
  const reportStillUp = reported.filter((r) => r.reportOutcome === "still_up").length;
  const reportOpen = reported.filter((r) => !r.reportOutcome || r.reportOutcome === "pending").length;
  const reportSuccess = reported.length
    ? Math.round((reportWon / reported.length) * 100)
    : null;

  // Fake-score buckets.
  const fakeBuckets = [
    { label: "0-39 (echt)", count: reviews.filter((r) => (r.aiFakeScore ?? 99) < 40).length },
    { label: "40-69 (twijfel)", count: reviews.filter((r) => { const s = r.aiFakeScore ?? 0; return s >= 40 && s < 70; }).length },
    { label: "70-100 (verdacht)", count: reviews.filter((r) => (r.aiFakeScore ?? -1) >= 70).length },
    { label: "niet gescoord", count: reviews.filter((r) => r.aiFakeScore === null).length },
  ];

  // Remover scorecard — the paid removal service.
  const pipeline = reviews.filter((r) => r.removalStage);
  const paidSum = pipeline.reduce((s, r) => s + ((r.paidAt && r.removalPrice) || 0), 0);
  const owedSum = pipeline
    .filter((r) => !r.paidAt && r.removalPrice && r.removalStage === "removed")
    .reduce((s, r) => s + (r.removalPrice || 0), 0);
  const done = pipeline.filter((r) => r.removalStage === "removed" && r.paidAt);
  const cameBack = pipeline.filter((r) => r.cameBackCount > 0);
  const avgDaysToRemoval = done.length
    ? Number(
        (
          done.reduce((s, r) => {
            if (!r.sentToRemoverAt || !r.removedAt) return s;
            return s + (r.removedAt.getTime() - r.sentToRemoverAt.getTime()) / 86400000;
          }, 0) / done.length
        ).toFixed(1)
      )
    : null;

  // Team activity this week (who did what).
  const userById = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));
  const teamCounts = new Map<string, number>();
  for (const a of weekActions) {
    const who = a.actorId && a.actorId !== "sync" && a.actorId !== "cron" ? userById.get(a.actorId) : null;
    const key = who ?? (a.actorId === "sync" ? "Sync (automatisch)" : a.actorId ?? "?");
    teamCounts.set(key, (teamCounts.get(key) ?? 0) + 1);
  }
  const team = [...teamCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return NextResponse.json(
    {
      total,
      avg,
      newThisWeek: reviews.filter((r) => r.createTime && r.createTime >= weekAgo).length,
      newLast24h: reviews.filter((r) => r.createTime && r.createTime >= dayAgo).length,
      activeCount: active.length,
      weeks,
      responseRate,
      unanswered: unanswered.length,
      overdueUnanswered,
      reported: reported.length,
      reportOpen,
      reportWon,
      reportStillUp,
      reportSuccess,
      fakeBuckets,
      remover: {
        inPipeline: pipeline.length,
        paidSum: Number(paidSum.toFixed(2)),
        owedSum: Number(owedSum.toFixed(2)),
        done: done.length,
        cameBack: cameBack.length,
        avgDaysToRemoval,
      },
      team,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
