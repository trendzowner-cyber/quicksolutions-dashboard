import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { refreshAccessToken, queryGoogleAds, GAQL_QUERIES } from "@/lib/google-ads";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

    if (!refreshToken || !customerId) {
      return NextResponse.json(
        { error: "Google Ads not configured" },
        { status: 500 }
      );
    }

    // Get fresh access token
    const { access_token } = await refreshAccessToken(refreshToken);

    // Fetch campaign data
    const [campaigns, account] = await Promise.all([
      queryGoogleAds(customerId, GAQL_QUERIES.campaignPerformance, access_token),
      queryGoogleAds(customerId, GAQL_QUERIES.accountSummary, access_token),
    ]);

    return NextResponse.json({
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
