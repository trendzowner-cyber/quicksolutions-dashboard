// Generic system-event log (ActivityEvent) — uptime flips, cron digests,
// Telegram-bot actions. The notification bell merges these with review actions
// at read time. Best-effort like logReviewAction: a failed log must never break
// the thing it is reporting on.

import { db } from "@/lib/db";

export type ActivityType =
  | "uptime_down"
  | "uptime_up"
  | "ads_digest"
  | "briefing"
  | "task_created_telegram"
  | "task_assigned"
  | "recurring_created"
  | "recurring_reminder"
  | "recurring_completed"
  | "recurring_missed"
  | "telegram_error";

export interface ActivityInput {
  title?: string | null;
  detail?: string | null;
  meta?: string | null;
  /** "cron" for system events (dings every user), or a user id when a person
   *  caused it (that user does not get belled for their own action). */
  actorId?: string | null;
}

export async function logActivity(type: ActivityType, data: ActivityInput = {}) {
  try {
    await db.activityEvent.create({
      data: {
        type,
        title: data.title ?? null,
        detail: data.detail ?? null,
        meta: data.meta ?? null,
        actorId: data.actorId ?? "cron",
      },
    });
  } catch {
    // best-effort logging
  }
}
