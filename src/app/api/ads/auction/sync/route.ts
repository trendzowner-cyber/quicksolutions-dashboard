import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { getAdAccessToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { syncAuctionPresence } from "@/lib/ads-presence";

export const maxDuration = 300;

// POST /api/ads/auction/sync — daily cron (pg_cron, X-Sync-Secret).
// Refreshes the trailing 7 completed days; backfills 90 days on first run.
// Read-only against Google — this route never mutates the ad account.
export async function POST(request: NextRequest) {
  if (!(await cronAuthorized(request))) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }
  try {
    const results = [];
    for (const accountId of ADS_ACCOUNTS) {
      const accessToken = await getAdAccessToken();
      const r = await syncAuctionPresence(accessToken, accountId);
      results.push({ accountId, ...r });
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: "Auction presence sync mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
