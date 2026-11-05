import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchConversionActions } from "@/lib/ads-creative";

export const maxDuration = 60;

// GET /api/ads/conversions?accountId=
// Conversion actions inventory + install snippets (read-only).
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
    const conversions = await fetchConversionActions(accessToken, accountId);
    return NextResponse.json({ conversions, total: conversions.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Conversies ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
