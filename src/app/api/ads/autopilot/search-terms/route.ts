import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import {
  fetchSearchTerms,
  analyzeSearchTerms,
  classifyTermsWithAi,
} from "@/lib/ads-autopilot";

export const maxDuration = 60;

// GET /api/ads/autopilot/search-terms?accountId=&dateRange=&ai=1
// The waste finder's read side. Rules always run; the AI verdict layer only
// runs with ai=1 (it costs a DeepSeek call and a few seconds).
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
    const withAi = request.nextUrl.searchParams.get("ai") === "1";

    const accessToken = await getAdAccessToken();
    const raw = await fetchSearchTerms(accessToken, accountId, dateRange);
    let rows = analyzeSearchTerms(raw);

    if (withAi) {
      try {
        const ai = await classifyTermsWithAi(rows);
        rows = rows.map((r) => {
          const verdict = ai[r.term];
          return verdict ? { ...r, aiVerdict: verdict.verdict, aiReason: verdict.reason } : r;
        });
      } catch (err) {
        // AI is a layer on top, never a blocker — rules alone are useful.
        console.error("AI-classificatie mislukt:", err);
      }
    }

    const wasteMicros = rows
      .filter((r) => r.verdict === "waste")
      .reduce((s, r) => s + r.costMicros, 0);

    return NextResponse.json({
      rows,
      summary: {
        total: rows.length,
        waste: rows.filter((r) => r.verdict === "waste").length,
        expensive: rows.filter((r) => r.verdict === "expensive").length,
        winners: rows.filter((r) => r.verdict === "winner").length,
        wasteCostMicros: wasteMicros,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Zoektermen ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
