import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS, fetchDailyTotals, queryGoogleAds } from "@/lib/google-ads";

export const maxDuration = 60;

// GET /api/ads/autopilot/timeseries?accountId=
// 30 days of daily spend/clicks/conversions for the charts on the page.
// Also returns per-channel breakdown (SEARCH / PERFORMANCE_MAX / DEMAND_GEN)
// for the stacked view.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const campaignId = request.nextUrl.searchParams.get("campaignId") || undefined;
    const accessToken = await getAdAccessToken();

    const campaignFilter = campaignId && /^\d+$/.test(campaignId) ? ` AND campaign.id = ${campaignId}` : "";

    const [totals, channelRes] = await Promise.all([
      fetchDailyTotals(accessToken, accountId, "LAST_30_DAYS", campaignId),
      queryGoogleAds(accountId, `
        SELECT segments.date, campaign.advertising_channel_type,
               metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.conversions_value
        FROM campaign
        WHERE campaign.status != 'REMOVED'${campaignFilter}
          AND segments.date DURING LAST_30_DAYS
        ORDER BY segments.date ASC
        LIMIT 2000
      `, accessToken).catch(() => ({ results: [] })),
    ]);

    const days = Object.entries(totals.byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, t]) => ({
        date: date.slice(5), // "MM-DD" for the axis
        fullDate: date,      // "YYYY-MM-DD" for week/month aggregation
        spend: Math.round(t.costMicros) / 1_000_000,
        clicks: t.clicks,
        impressions: t.impressions,
        conversions: Math.round(t.conversions * 100) / 100,
        allConversions: Math.round(t.allConversions * 100) / 100,
        convValue: Math.round(t.conversionsValue * 100) / 100,
        impressionShare: t.impressionShare !== null ? Math.round(t.impressionShare * 1000) / 10 : null,
      }));

    // Per-channel daily spend for the stacked chart
    const byDateChannel = new Map<string, Record<string, number>>();
    for (const r of (channelRes.results ?? []) as Record<string, Record<string, unknown>>[]) {
      const date = String((r.segments ?? {}).date ?? "");
      const ch = String((r.campaign ?? {}).advertisingChannelType ?? (r.campaign ?? {}).advertising_channel_type ?? "OTHER");
      if (!date) continue;
      const entry = byDateChannel.get(date) ?? {};
      entry[ch] = (entry[ch] ?? 0) + Number((r.metrics ?? {}).costMicros ?? (r.metrics ?? {}).cost_micros ?? 0) / 1e6;
      byDateChannel.set(date, entry);
    }
    const channelDays = [...byDateChannel.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ch]) => ({
        fullDate: date,
        search: Math.round((ch.SEARCH ?? 0) * 100) / 100,
        pmax: Math.round((ch.PERFORMANCE_MAX ?? 0) * 100) / 100,
        demandGen: Math.round((ch.DEMAND_GEN ?? 0) * 100) / 100,
        other: Math.round(((ch.DISPLAY ?? 0) + (ch.VIDEO ?? 0) + (ch.SHOPPING ?? 0) + (ch.OTHER ?? 0) + (ch.MULTI_CHANNEL ?? 0) + (ch.LOCAL ?? 0) + (ch.SMART ?? 0)) * 100) / 100,
      }));

    return NextResponse.json({ days, channelDays });
  } catch (error) {
    return NextResponse.json(
      { error: "Tijdreeks ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
