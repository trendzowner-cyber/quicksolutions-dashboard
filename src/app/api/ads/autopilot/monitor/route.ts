import { NextResponse } from "next/server";
import { cronAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS, accountLabel } from "@/lib/google-ads";
import { detectAnomalies } from "@/lib/ads-autopilot";
import { sendTelegram } from "@/lib/telegram";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 60;

// POST /api/ads/autopilot/monitor
// pg_cron calls this once a day (after the digest, so both use fresh data).
// Alert-only by design: the monitor never touches bids, budgets or keywords —
// it tells a human that something moved, the human decides in the dashboard.
export async function POST(request: Request) {
  if (!(await cronAuthorized(request))) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ ok: false, reason: "Google Ads niet verbonden" });
    }
    const accessToken = await getAdAccessToken();

    const all: { account: string; anomalies: Awaited<ReturnType<typeof detectAnomalies>> }[] = [];
    for (const accountId of ADS_ACCOUNTS) {
      const anomalies = await detectAnomalies(accessToken, accountId);
      const real = anomalies.filter((a) => a.kind !== "no_data");
      if (real.length) all.push({ account: accountLabel(accountId), anomalies: real });
    }

    if (!all.length) {
      await logActivity("ads_autopilot", { title: "Ads monitor: geen anomalieën" });
      return NextResponse.json({ ok: true, anomalies: 0 });
    }

    const lines = all.flatMap(({ account, anomalies }) =>
      anomalies.map((a) => `${a.severity === "critical" ? "🚨" : "⚠️"} [${account}] ${a.message}`)
    );
    const text = `Ads Autopilot — anomalie gedetecteerd:\n\n${lines.join("\n")}\n\nBekijk: /dashboard/autopilot`;
    const sent = await sendTelegram(text);

    await logActivity("ads_autopilot", {
      title: `Ads monitor: ${lines.length} anomalie(ën)`,
      detail: lines.join("\n").slice(0, 500),
    });

    return NextResponse.json({ ok: true, anomalies: lines.length, sent });
  } catch (error) {
    await logActivity("ads_autopilot", {
      title: "Ads monitor mislukt",
      detail: String(error).slice(0, 300),
    });
    return NextResponse.json(
      { error: "Monitor mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
