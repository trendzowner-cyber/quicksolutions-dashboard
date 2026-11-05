import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { fetchDomainDrilldown } from "@/lib/ads-presence";

export const maxDuration = 60;

// GET /api/ads/auction/domain?domain=coolblue.be
// Live keyword-level drilldown: which of our keywords this domain contested
// over the trailing 30 completed days. Read-only, no storage.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const domain = String(request.nextUrl.searchParams.get("domain") ?? "").trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: "Ongeldig domein" }, { status: 400 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const accessToken = await getAdAccessToken();
    const drilldown = await fetchDomainDrilldown(accessToken, ADS_ACCOUNTS[0], domain, start, end);
    return NextResponse.json(drilldown);
  } catch (error) {
    return NextResponse.json(
      { error: "Drilldown ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
