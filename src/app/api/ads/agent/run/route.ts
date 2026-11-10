import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { generateProposals } from "@/lib/ads-agent";

export const maxDuration = 60;

// POST /api/ads/agent/run { accountId? }
// Analyses the account and writes new proposals. Read-only against Google —
// proposals only execute after human approval.
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    let accountId = ADS_ACCOUNTS[0];
    try {
      const body = await request.json();
      if (body?.accountId) accountId = String(body.accountId);
    } catch { /* no body is fine */ }

    const accessToken = await getAdAccessToken();
    const result = await generateProposals(accessToken, accountId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Agent run mislukt:", err);
    return NextResponse.json({ error: "Agent-analyse mislukt", details: String(err) }, { status: 500 });
  }
}
