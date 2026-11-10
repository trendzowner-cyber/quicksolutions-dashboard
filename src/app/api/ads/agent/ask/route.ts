import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { askAgent } from "@/lib/ads-agent";

export const maxDuration = 60;

// POST /api/ads/agent/ask { question, accountId? }
// Free-form question answering with live account data + memory as context.
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const question = String(body?.question ?? "").trim();
    if (!question || question.length > 1000) {
      return NextResponse.json({ error: "Vraag verplicht (max 1000 tekens)" }, { status: 400 });
    }
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = String(body?.accountId ?? "") || ADS_ACCOUNTS[0];
    const accessToken = await getAdAccessToken();
    const answer = await askAgent(accessToken, accountId, question);
    return NextResponse.json({ ok: true, answer });
  } catch (err) {
    console.error("Agent ask mislukt:", err);
    return NextResponse.json({ error: "Vraag mislukt", details: String(err) }, { status: 500 });
  }
}
