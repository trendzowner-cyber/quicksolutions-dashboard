// Push notification for a newly-arrived review.
//
// Every new review alerts, whatever the score. The previous split (Telegram
// only for 1★ or a high AI fake-score) meant a flat 2★ or a gushing 5★ landed
// silently — which defeats the point of the alert path, since the review you
// most want to answer fast is rarely the one the AI flags as fraudulent.

import { sendTelegram } from "@/lib/telegram";
import { notifyAllPush } from "@/lib/push";

export interface NewReviewAlert {
  reviewerName: string;
  starRating: number;
  comment: string | null;
  reviewUrl: string | null;
  /** Where the row came from — shown in the footer for sync debugging. */
  source: string;
  aiFakeScore?: number | null;
}

export async function alertNewReview(r: NewReviewAlert): Promise<boolean> {
  const rating = Math.max(0, Math.min(5, r.starRating));
  const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
  // 3★ and below is where a reply actually changes the outcome.
  const needsReply = rating <= 3;

  const dashboard = process.env.DASHBOARD_URL
    ? `${process.env.DASHBOARD_URL.replace(/\/$/, "")}/dashboard/reviews`
    : "/dashboard/reviews";

  const lines = [
    needsReply
      ? "🔴 New review — quicksolutionspro.be"
      : "⭐ New review — quicksolutionspro.be",
    `${stars} (${rating}/5) · ${r.reviewerName}`,
    r.comment?.trim() ? `"${r.comment.trim().slice(0, 300)}"` : "(no text)",
    r.aiFakeScore != null && r.aiFakeScore >= 40
      ? `AI suspicion score: ${r.aiFakeScore}/100`
      : "",
    // The review link first — it is the one that lets you act immediately.
    r.reviewUrl ?? "",
    needsReply ? "→ Reply within 24h" : "",
    `Dashboard: ${dashboard}`,
    `Source: ${r.source}`,
  ].filter(Boolean);

  const telegramResult = await sendTelegram(lines.join("\n"));

  // Phone push to every subscribed device. Swallowed entirely — a push failure
  // must never take the Telegram alert (or the sync run) down with it.
  try {
    await notifyAllPush({
      title: "Nieuwe review",
      body: `${r.reviewerName} · ${rating}/5${
        r.comment?.trim() ? ` — ${r.comment.trim().slice(0, 80)}` : ""
      }`,
      url: dashboard,
      tag: "qs-new-review",
    });
  } catch {
    // No-op by design.
  }

  return telegramResult;
}
