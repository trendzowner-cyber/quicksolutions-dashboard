import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { dateClause } from "@/lib/ads-autopilot";
import { fetchCampaignInventory, fetchImpressionShareSeries } from "@/lib/ads-inventory";

export const maxDuration = 60;

// GET /api/ads/inventory?accountId=&dateRange=&start=&end=
// Campaign inventory + impression-share series for the Campagnes tab.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const clause = dateClause(
      request.nextUrl.searchParams.get("dateRange") || "LAST_30_DAYS",
      request.nextUrl.searchParams.get("start"),
      request.nextUrl.searchParams.get("end")
    );

    const accessToken = await getAdAccessToken();
    const [campaigns, impressionShare] = await Promise.all([
      fetchCampaignInventory(accessToken, accountId, clause),
      fetchImpressionShareSeries(accessToken, accountId, clause),
    ]);

    return NextResponse.json({ campaigns, impressionShare });
  } catch (error) {
    return NextResponse.json(
      { error: "Campagnes ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
