// Weekly review digest: 7-day stats from the DB, summarized by AI.
// Goes to Telegram, which only Kerim reads — so English.

import { db } from "@/lib/db";
import { callDeepSeek } from "@/lib/deepseek";
import { OUTCOME_EN } from "@/lib/review-outcomes";

const WEEK_MS = 7 * 86400000;

export async function buildWeeklyDigest(): Promise<string> {
  const since = new Date(Date.now() - WEEK_MS);

  const [newReviews, removed, reported, all] = await Promise.all([
    db.googleReview.findMany({
      where: { firstSeenAt: { gte: since } },
      orderBy: { firstSeenAt: "desc" },
    }),
    db.googleReview.findMany({
      where: { removedAt: { gte: since } },
    }),
    db.googleReview.findMany({
      where: { reportedAt: { gte: since } },
    }),
    db.googleReview.count(),
  ]);

  const suspicious = newReviews.filter((r) => (r.aiFakeScore ?? 0) >= 70);
  const lowStars = newReviews.filter((r) => r.starRating <= 3);
  const avgStars =
    newReviews.length > 0
      ? (newReviews.reduce((s, r) => s + r.starRating, 0) / newReviews.length).toFixed(1)
      : null;
  const outcomes = reported.reduce<Record<string, number>>((acc, r) => {
    const o = r.reportOutcome ?? "no outcome";
    acc[o] = (acc[o] ?? 0) + 1;
    return acc;
  }, {});

  const stats = [
    `Period: last 7 days`,
    `Total reviews in database: ${all}`,
    `New reviews: ${newReviews.length}${avgStars ? ` (average ${avgStars}/5)` : ""}`,
    `Suspicious new reviews (AI score >= 70): ${suspicious.length}`,
    `New reviews with 3 stars or fewer: ${lowStars.length}`,
    `Reviews reported: ${reported.length}${
      Object.keys(outcomes).length
        ? " — " + Object.entries(outcomes).map(([k, v]) => `${OUTCOME_EN[k] ?? k}: ${v}`).join(", ")
        : ""
    }`,
    `Reviews removed by Google (auto-detected): ${removed.length}`,
  ];

  const details = [
    suspicious.length
      ? `Suspicious reviews:\n${suspicious
          .map((r) => `- ${r.starRating}★ ${r.reviewerName}: "${(r.comment ?? "").slice(0, 80)}" (AI score ${r.aiFakeScore})`)
          .join("\n")}`
      : "",
    removed.length
      ? `Removed reviews:\n${removed
          .map((r) => `- ${r.starRating}★ ${r.reviewerName}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const raw = await callDeepSeek({
      systemPrompt:
        "You are the assistant of the owner of QuickSolutionsPro (Belgian webshop, refurbished Apple/electronics). " +
        "Write a concise weekly reviews summary in English based on the given statistics. " +
        "Write 4-8 short lines. Start with what matters most (new negative or suspicious reviews). " +
        "No emoji, no bullet characters like - or *, just lines of text. Max 600 characters.",
      userPrompt: stats.join("\n") + (details ? `\n\n${details}` : ""),
      temperature: 0.4,
      maxTokens: 600,
    });
    const cleaned = raw.replace(/```/g, "").trim();
    if (cleaned) return `QuickSolutionsPro — weekly review report\n\n${cleaned}`;
  } catch {
    // fall through to raw stats
  }

  return `QuickSolutionsPro — weekly review report\n\n${stats.join("\n")}`;
}
