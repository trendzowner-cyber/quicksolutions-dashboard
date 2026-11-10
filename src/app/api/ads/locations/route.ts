import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchCampaignLocations } from "@/lib/ads-locations";

export const maxDuration = 60;

// GET /api/ads/locations?accountId= — read-only geo targeting per campaign.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const rows = await fetchCampaignLocations(await getAdAccessToken(), accountId);
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Locaties ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
