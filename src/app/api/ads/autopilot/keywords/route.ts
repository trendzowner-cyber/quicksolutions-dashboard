import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchKeywordFlags } from "@/lib/ads-autopilot";

export const maxDuration = 60;

// GET /api/ads/autopilot/keywords?accountId=&dateRange=
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
    const rows = await fetchKeywordFlags(accessToken, accountId, dateRange);
    return NextResponse.json({
      rows,
      summary: {
        total: rows.length,
        pauseCandidates: rows.filter((r) => r.flag === "pause_candidate").length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Keywords ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
