import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { refreshAccessToken, queryGoogleAds, buildCampaignQuery, buildAccountQuery } from "@/lib/google-ads";

const ACCOUNT_IDS = (process.env.GOOGLE_ADS_CUSTOMER_IDS || "480-889-6252").split(",").map((s) => s.trim());
const ACCOUNT_LABELS: Record<string, string> = { "480-889-6252": "Google Shopping", "668-709-2345": "Repair" };

export async function GET(request: NextRequest) {
  if (!(await verifySession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    if (!refreshToken) return NextResponse.json({ error: "Google Ads not configured" }, { status: 500 });

    const accountId = request.nextUrl.searchParams.get("accountId") || ACCOUNT_IDS[0];
    const dateRange = request.nextUrl.searchParams.get("dateRange") || "LAST_30_DAYS";

    const { access_token } = await refreshAccessToken(refreshToken);
    const [campaignRes, accountRes] = await Promise.all([
      queryGoogleAds(accountId, buildCampaignQuery(dateRange), access_token),
      queryGoogleAds(accountId, buildAccountQuery(dateRange), access_token),
    ]);

    // Parse and aggregate campaign data by campaign (since date segments create multiple rows per campaign)
    const campaignMap = new Map<string, Record<string, number>>();
    (campaignRes.results || []).forEach((r: Record<string, unknown>) => {
      const c = r.campaign as Record<string, unknown>;
      const m = r.metrics as Record<string, unknown>;
      const id = c.id as string;
      if (!campaignMap.has(id)) {
        campaignMap.set(id, {
          impressions: 0, clicks: 0, costMicros: 0, conversions: 0,
          ctr: 0, averageCpc: 0, conversionsValue: 0, dayCount: 0,
        });
      }
      const entry = campaignMap.get(id)!;
      entry.impressions += Number(m.impressions) || 0;
      entry.clicks += Number(m.clicks) || 0;
      entry.costMicros += Number(m.costMicros || m.cost_micros) || 0;
      entry.conversions += Number(m.conversions) || 0;
      entry.conversionsValue += Number(m.conversionsValue || m.conversions_value) || 0;
      entry.dayCount += 1;
      entry.ctr += Number(m.ctr) || 0;
      entry.averageCpc += Number(m.average_cpc) || 0;
    });

    const campaigns = Array.from(campaignMap.entries()).map(([id, metrics]) => ({
      id,
      name: (campaignRes.results || []).find((r: Record<string, unknown>) => (r.campaign as Record<string, unknown>).id === id)?.campaign?.name || id,
      status: (campaignRes.results || []).find((r: Record<string, unknown>) => (r.campaign as Record<string, unknown>).id === id)?.campaign?.status || "UNKNOWN",
      channel: (() => { const c = (campaignRes.results || []).find((r: Record<string, unknown>) => (r.campaign as Record<string, unknown>).id === id)?.campaign as Record<string, unknown>; return (c?.advertisingChannelType || c?.advertising_channel_type || "UNKNOWN") as string; })(),
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      costMicros: metrics.costMicros,
      conversions: metrics.conversions,
      ctr: metrics.dayCount > 0 ? metrics.ctr / metrics.dayCount : 0,
      averageCpc: metrics.dayCount > 0 ? metrics.averageCpc / metrics.dayCount : 0,
      conversionsValue: metrics.conversionsValue,
    }));

    // Sort by impressions desc
    campaigns.sort((a, b) => b.impressions - a.impressions);

    // Compute totals from campaigns (more reliable than account-level query with date segments)
    const totals = {
      impressions: campaigns.reduce((s, c) => s + c.impressions, 0),
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      costMicros: campaigns.reduce((s, c) => s + c.costMicros, 0),
      conversions: campaigns.reduce((s, c) => s + c.conversions, 0),
      ctr: 0,
      averageCpc: 0,
      conversionsValue: campaigns.reduce((s, c) => s + c.conversionsValue, 0),
    };
    totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
    totals.averageCpc = totals.clicks > 0 ? totals.costMicros / totals.clicks : 0;
    const accountName = accountRes.results?.[0]?.customer?.descriptive_name || "";

    return NextResponse.json({
      accountId, dateRange,
      accounts: ACCOUNT_IDS.map((id) => ({ id, label: ACCOUNT_LABELS[id] || id })),
      accountName,
      totals,
      campaigns,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch ads data", details: String(error) }, { status: 500 });
  }
}
