import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchNegatives } from "@/lib/ads-inventory";

export const maxDuration = 60;

// GET /api/ads/negatives?accountId=
// Every negative keyword on the account: campaign-level and shared-set.
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
    const negatives = await fetchNegatives(accessToken, accountId);
    return NextResponse.json({ negatives, total: negatives.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Negatieve keywords ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
