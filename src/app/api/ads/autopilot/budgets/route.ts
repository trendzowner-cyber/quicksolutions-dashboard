import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchBudgetAdvice } from "@/lib/ads-autopilot";

export const maxDuration = 60;

// GET /api/ads/autopilot/budgets?accountId=&dateRange=
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const dateRange = request.nextUrl.searchParams.get("dateRange") || "LAST_30_DAYS";

    const accessToken = await getAdAccessToken();
    const advice = await fetchBudgetAdvice(accessToken, accountId, dateRange);
    return NextResponse.json({ advice });
  } catch (error) {
    return NextResponse.json(
      { error: "Budgetadvies ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
