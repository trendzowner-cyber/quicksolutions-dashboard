import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import {
  queryGoogleAds,
  buildCampaignQuery,
  buildAccountQuery,
  getAdAccessToken,
  getAdRefreshToken,
  ADS_ACCOUNTS as ACCOUNT_IDS,
  ADS_ACCOUNT_LABELS as ACCOUNT_LABELS,
} from "@/lib/google-ads";

export async function GET(request: NextRequest) {
  if (!(await verifySession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const refreshToken = await getAdRefreshToken();
    if (!refreshToken) return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });

    const accountId = request.nextUrl.searchParams.get("accountId") || ACCOUNT_IDS[0];
    const dateRange = request.nextUrl.searchParams.get("dateRange") || "LAST_30_DAYS";

    // Refreshes and rotates the stored token; drops the row when Google
    // rejects it so a fresh OAuth connect can save a new one.
    let access_token: string;
    try {
      access_token = await getAdAccessToken();
    } catch (err) {
      return NextResponse.json(
        { error: String(err), details: "Google Ads opnieuw verbinden nodig — klik op Google verbinden" },
        { status: 500 }
      );
    }

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
