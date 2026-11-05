import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { runAudit } from "@/lib/ads-audit";
import { callDeepSeek } from "@/lib/deepseek";

export const maxDuration = 300;

// GET /api/ads/audit?accountId=&narrative=1
// Runs the ten automated checks. narrative=1 adds a DeepSeek-written summary
// in the style of an agency account review — the AI only narrates what the
// deterministic checks already found, it never invents numbers.
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!(await getAdRefreshToken())) {
      return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
    }
    const accountId = request.nextUrl.searchParams.get("accountId") || ADS_ACCOUNTS[0];
    const withNarrative = request.nextUrl.searchParams.get("narrative") === "1";

    const accessToken = await getAdAccessToken();
    const findings = await runAudit(accessToken, accountId);

    let narrative: string | null = null;
    if (withNarrative) {
      const facts = findings
        .filter((f) => f.severity !== "unavailable")
        .map((f) => `[${f.severity}] ${f.title}: ${f.detail} ${f.stats ? JSON.stringify(f.stats) : ""}`)
        .join("\n");
      try {
        narrative = await callDeepSeek({
          systemPrompt: `Je bent een senior Google Ads auditor voor QuickSolutions Pro, een Belgisch reparatiebedrijf (Gent). Schrijf een korte account-review in het Nederlands: eerst 2-3 zinnen "Wat ik vond", dan "Wat er mis is" als genummerde punten (alleen critical/warning), dan "Wat er goed is" in 1-2 zinnen. Gebruik ALLEEN de aangeleverde bevindingen — verzin geen cijfers. Toon: zakelijk, direct, geen jargon.`,
          userPrompt: `Bevindingen van de geautomatiseerde audit:\n${facts}`,
          temperature: 0.3,
          maxTokens: 1500,
        });
      } catch (err) {
        console.error("Audit-narratief mislukt:", err);
      }
    }

    return NextResponse.json({
      findings,
      narrative,
      summary: {
        critical: findings.filter((f) => f.severity === "critical").length,
        warning: findings.filter((f) => f.severity === "warning").length,
        ok: findings.filter((f) => f.severity === "ok").length,
        unavailable: findings.filter((f) => f.severity === "unavailable").length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Audit mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
