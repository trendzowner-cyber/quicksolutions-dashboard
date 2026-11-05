import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { dateClause } from "@/lib/ads-autopilot";
import { fetchAdVariants, attachHeadlineMetrics } from "@/lib/ads-creative";

export const maxDuration = 60;

// GET /api/ads/ads?accountId=&dateRange=&start=&end=
// Ad variants (RSA) with per-headline performance labels + asset metrics.
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
    const ads = await fetchAdVariants(accessToken, accountId, clause);
    await attachHeadlineMetrics(accessToken, accountId, ads, clause);

    return NextResponse.json({ ads, total: ads.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Advertenties ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
