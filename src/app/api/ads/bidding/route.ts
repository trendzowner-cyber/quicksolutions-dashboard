import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchBiddingOverview } from "@/lib/ads-bidding";

export const maxDuration = 60;

// GET /api/ads/bidding?accountId= — read-only bid strategy overview.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const rows = await fetchBiddingOverview(await getAdAccessToken(), accountId);
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { error: "Biedstrategieën ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
