import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { refreshAccessToken, queryGoogleAds, GAQL_QUERIES } from "@/lib/google-ads";

const ACCOUNT_IDS = (process.env.GOOGLE_ADS_CUSTOMER_IDS || "480-889-6252").split(",").map((s) => s.trim());
const ACCOUNT_LABELS: Record<string, string> = {
  "480-889-6252": "Google Shopping",
  "668-709-2345": "Repair",
};

export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Google Ads not configured" },
        { status: 500 }
      );
    }

    // Support ?accountId= parameter, default to first
    const accountId = request.nextUrl.searchParams.get("accountId") || ACCOUNT_IDS[0];

    // Get fresh access token
    const { access_token } = await refreshAccessToken(refreshToken);

    // Fetch campaign data for the selected account
    const [campaigns, account] = await Promise.all([
      queryGoogleAds(accountId, GAQL_QUERIES.campaignPerformance, access_token),
      queryGoogleAds(accountId, GAQL_QUERIES.accountSummary, access_token),
    ]);

    return NextResponse.json({
      accountId,
      accounts: ACCOUNT_IDS.map((id) => ({ id, label: ACCOUNT_LABELS[id] || id })),
      campaigns: campaigns.results || [],
      account: account.results?.[0] || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch ads data", details: String(error) },
      { status: 500 }
    );
  }
}
