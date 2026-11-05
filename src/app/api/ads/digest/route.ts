import { NextResponse } from "next/server";
import { cronAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { buildAdsDigest } from "@/lib/ads-digest";
import { logActivity } from "@/lib/activity-log";
import { sendTelegram } from "@/lib/telegram";

export const maxDuration = 60;

// POST → build and send the daily ads digest. Called by pg_cron at 06:30 UTC
// (= 08:30 Brussels in summer), or manually from the dashboard.
export async function POST(request: Request) {
  if (!(await cronAuthorized(request))) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  try {
    const { ok, text } = await buildAdsDigest();
    const sent = await sendTelegram(text);

    await logActivity("ads_digest", {
      title: ok ? "Advertentierapport verzonden" : "Advertentierapport overgeslagen",
      detail: ok ? null : text.slice(0, 200),
    });

    return NextResponse.json({ ok, sent, text });
  } catch (error) {
    await logActivity("ads_digest", {
      title: "Advertentierapport mislukt",
      detail: String(error).slice(0, 300),
    });
    return NextResponse.json(
      { error: "Failed to build ads digest", details: String(error) },
      { status: 500 }
    );
  }
}
