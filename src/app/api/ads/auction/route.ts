import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { probeAuctionApi, importAuctionCsv, getCompetitorPresence } from "@/lib/ads-auction";

export const maxDuration = 60;

// GET /api/ads/auction — presence table + whether the raw API is allowlisted
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const competitors = await getCompetitorPresence();

    let api: { available: boolean; reason?: string } = { available: false };
    if (await getAdRefreshToken()) {
      const accessToken = await getAdAccessToken();
      api = await probeAuctionApi(accessToken, ADS_ACCOUNTS[0]);
    }

    return NextResponse.json({ competitors, api });
  } catch (error) {
    return NextResponse.json(
      { error: "Auction data ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/ads/auction — import a CSV export from the Google Ads UI.
// Body: { csv: string, pulledOn?: "YYYY-MM-DD" }
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const csv = String(body.csv ?? "");
    if (!csv.trim()) {
      return NextResponse.json({ error: "csv ontbreekt" }, { status: 400 });
    }
    const pulledOn = body.pulledOn ? new Date(String(body.pulledOn)) : new Date();
    if (isNaN(pulledOn.getTime())) {
      return NextResponse.json({ error: "Ongeldige datum" }, { status: 400 });
    }

    const result = await importAuctionCsv(csv, pulledOn);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: "CSV-import mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
