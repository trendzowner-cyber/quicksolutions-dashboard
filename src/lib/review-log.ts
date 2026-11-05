// Action-history logging for review management (ReviewAction table).
// Best-effort: logging must never break the flow it's called from.

import { db } from "@/lib/db";
import { ACTION_LABELS } from "@/lib/review-outcomes";

export { ACTION_LABELS };

export async function logReviewAction(
  reviewId: string,
  action: string,
  opts: { detail?: string | null; actorId?: string | null } = {}
) {
  try {
    await db.reviewAction.create({
      data: {
        reviewId,
        action,
        detail: opts.detail ?? null,
        actorId: opts.actorId ?? null,
      },
    });
  } catch {
    // best-effort logging
  }
}
