import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { getPresenceSummary, getAuctionChanges } from "@/lib/ads-presence";

export const maxDuration = 60;

// GET /api/ads/auction/presence — daily competitor presence (API source),
// coverage metadata and deterministic change cards.
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { summary, coverage } = await getPresenceSummary();

    let changes: Awaited<ReturnType<typeof getAuctionChanges>> = [];
    if (summary.length && (await getAdRefreshToken())) {
      const accessToken = await getAdAccessToken();
      changes = await getAuctionChanges(accessToken, ADS_ACCOUNTS[0]);
    }

    return NextResponse.json({ competitors: summary, coverage, changes });
  } catch (error) {
    return NextResponse.json(
      { error: "Presence ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
