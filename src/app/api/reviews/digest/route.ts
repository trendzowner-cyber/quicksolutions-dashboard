import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { sendTelegram } from "@/lib/telegram";
import { buildWeeklyDigest } from "@/lib/review-digest";

// POST → build the weekly AI digest and push it to Telegram.
// Auth: X-Sync-Secret header (Supabase cron, Monday 07:30) or a dashboard session.
export async function POST(request: Request) {
  const secret = request.headers.get("x-sync-secret");
  const secretOk =
    !!process.env.REVIEWS_SYNC_SECRET && secret === process.env.REVIEWS_SYNC_SECRET;
  const sessionOk = await verifySession();
  if (!secretOk && !sessionOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const text = await buildWeeklyDigest();
  await sendTelegram(text);
  return NextResponse.json({ ok: true, text });
}
