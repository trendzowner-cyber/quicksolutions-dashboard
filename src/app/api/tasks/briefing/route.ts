import { NextResponse } from "next/server";
import { cronAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { buildMorningBriefing } from "@/lib/morning-briefing";
import { logActivity } from "@/lib/activity-log";
import { sendTelegram } from "@/lib/telegram";

export const maxDuration = 30;

// POST → build and send the morning briefing. pg_cron fires this at 06:00 UTC
// (= 08:00 Brussels in summer).
export async function POST(request: Request) {
  if (!(await cronAuthorized(request))) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  try {
    const text = await buildMorningBriefing();
    const sent = await sendTelegram(text);

    await logActivity("briefing", { title: "Ochtendbriefing verzonden" });

    return NextResponse.json({ ok: true, sent, text });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to build briefing", details: String(error) },
      { status: 500 }
    );
  }
}
