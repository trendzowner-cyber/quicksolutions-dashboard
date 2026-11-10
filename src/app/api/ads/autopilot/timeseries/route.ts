import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS, fetchDailyTotals } from "@/lib/google-ads";

export const maxDuration = 60;

// GET /api/ads/autopilot/timeseries?accountId=
// 30 days of daily spend/clicks/conversions for the charts on the page.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const accessToken = await getAdAccessToken();
    const { byDate } = await fetchDailyTotals(accessToken, accountId, "LAST_30_DAYS");

    const days = Object.entries(byDate)
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

    return NextResponse.json({ days });
  } catch (error) {
    return NextResponse.json(
      { error: "Tijdreeks ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
