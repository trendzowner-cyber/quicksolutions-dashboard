import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { scoreAndAlert } from "@/lib/review-ai";
import { logReviewAction } from "@/lib/review-log";
import { parseGbpReviewsCsv } from "@/lib/review-csv";

// POST { csv } → bulk-import the CSV export from Google Business Profile
// (business.google.com → Reviews → Download). Free + official — the interim
// way to get ALL reviews without the Business Profile API approval.
// Imported rows get googleReviewId "import-<hash>" so they're excluded from
// sync removal detection; the sync merges them into real rows on approval.
export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ error: "CSV is leeg" }, { status: 400 });
  }

  let rows;
  try {
    rows = parseGbpReviewsCsv(csv);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Geen reviews in het CSV gevonden" }, { status: 400 });
  }

  const actorId = request.headers.get("x-user-id") ?? "dashboard";
  let created = 0;
  let updated = 0;

  // The CSV has no review links — adopt the exact public Maps link from a
  // content-matching row (Outscraper review_link) so every team member can
  // open the review directly on Google Maps.
  const urlRows = await db.googleReview.findMany({
    where: { reviewUrl: { not: null } },
    select: { reviewerName: true, comment: true, reviewUrl: true },
  });
  const urlByKey = new Map(
    urlRows.map((r) => [`${r.reviewerName}|${r.comment ?? ""}`, r.reviewUrl])
  );

  for (const r of rows) {
    const hash = createHash("md5")
      .update(`${r.reviewerName}|${r.comment ?? ""}|${r.starRating}`)
      .digest("hex")
      .slice(0, 12);
    const googleReviewId = `import-${hash}`;
    const urlKey = `${r.reviewerName}|${r.comment ?? ""}`;
    const existing = await db.googleReview.findUnique({ where: { googleReviewId } });
    if (existing) {
      await db.googleReview.update({
        where: { googleReviewId },
        data: {
          reviewerName: r.reviewerName,
          starRating: r.starRating,
          comment: r.comment,
          createTime: r.createTime ? new Date(r.createTime) : null,
          lastSeenAt: new Date(),
          reviewUrl: existing.reviewUrl || urlByKey.get(urlKey) || undefined,
        },
      });
      updated++;
    } else {
      const review = await db.googleReview.create({
        data: {
          googleReviewId,
          reviewerName: r.reviewerName,
          starRating: r.starRating,
          comment: r.comment,
          createTime: r.createTime ? new Date(r.createTime) : null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          status: "active",
          reviewUrl: urlByKey.get(urlKey) ?? null,
        },
      });
      created++;
      await logReviewAction(review.id, "created", {
        detail: "CSV-import van Google",
        actorId,
      });
      if (r.starRating >= 1 && r.starRating <= 3) {
        await scoreAndAlert(googleReviewId, r.comment, r.starRating).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true, created, updated, total: rows.length });
}
