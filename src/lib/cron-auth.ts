// Shared gate for the routes Supabase pg_cron and the Telegram webhook call.
//
// These routes are whitelisted in src/middleware.ts (no session cookie exists
// on a cron request), so each one authenticates itself: the shared secret
// header, or a real session for the manual "run it now" button.

import { timingSafeEqual } from "node:crypto";
import { verifySession } from "@/lib/auth";

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True when the request carries the cron secret or a valid dashboard session. */
export async function cronAuthorized(request: Request): Promise<boolean> {
  const expected = process.env.REVIEWS_SYNC_SECRET;
  const provided = request.headers.get("x-sync-secret");
  if (expected && provided && safeEqual(provided, expected)) return true;
  return verifySession();
}

/** The Telegram webhook authenticates on Telegram's own header instead. */
export function telegramWebhookAuthorized(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}

export const UNAUTHORIZED = { error: "Unauthorized" };
