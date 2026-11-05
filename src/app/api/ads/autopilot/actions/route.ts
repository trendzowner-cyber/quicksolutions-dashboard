import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  addNegativeKeywords,
  pauseKeyword,
  setCampaignBudget,
} from "@/lib/ads-autopilot";

export const maxDuration = 60;

// POST /api/ads/autopilot/actions
// The ONLY write path into the Google Ads account. Session-gated, one action
// per call, every call written to AuditLog — if a mutation ever surprises us,
// the log says who clicked what and when.
//
// Body shapes:
//   { type: "add_negatives",  customerId, campaignId, terms: string[] }
//   { type: "pause_keyword",  customerId, criterionResourceName, label? }
//   { type: "set_budget",     customerId, budgetResourceName, amountMicros, label? }
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const type = String(body.type ?? "");
  const customerId = String(body.customerId ?? "");
  if (!customerId) {
    return NextResponse.json({ error: "customerId ontbreekt" }, { status: 400 });
  }

  const user = await getSessionUser();

  try {
    let summary: string;

    if (type === "add_negatives") {
      const campaignId = String(body.campaignId ?? "");
      const terms = Array.isArray(body.terms) ? body.terms.map(String).filter(Boolean) : [];
      if (!campaignId || !terms.length) {
        return NextResponse.json({ error: "campaignId en terms zijn verplicht" }, { status: 400 });
      }
      if (terms.length > 50) {
        return NextResponse.json({ error: "Max 50 negatieve keywords per actie" }, { status: 400 });
      }
      await addNegativeKeywords(customerId, campaignId, terms);
      summary = `${terms.length} negatieve keyword(s) toegevoegd aan campagne ${campaignId}: ${terms.slice(0, 5).join(", ")}${terms.length > 5 ? "…" : ""}`;
    } else if (type === "pause_keyword") {
      const criterionResourceName = String(body.criterionResourceName ?? "");
      if (!criterionResourceName) {
        return NextResponse.json({ error: "criterionResourceName ontbreekt" }, { status: 400 });
      }
      await pauseKeyword(customerId, criterionResourceName);
      summary = `Keyword gepauzeerd: ${String(body.label ?? criterionResourceName)}`;
    } else if (type === "set_budget") {
      const budgetResourceName = String(body.budgetResourceName ?? "");
      const amountMicros = Number(body.amountMicros);
      if (!budgetResourceName || !Number.isFinite(amountMicros) || amountMicros <= 0) {
        return NextResponse.json({ error: "budgetResourceName en amountMicros zijn verplicht" }, { status: 400 });
      }
      // Hard ceiling: no single click should ever be able to set a budget a
      // small business can't survive. €500/day is far above anything this
      // account runs.
      if (amountMicros > 500_000_000) {
        return NextResponse.json({ error: "Budget boven de €500/dag limiet" }, { status: 400 });
      }
      await setCampaignBudget(customerId, budgetResourceName, amountMicros);
      summary = `Budget aangepast: ${String(body.label ?? budgetResourceName)} → €${(amountMicros / 1_000_000).toFixed(2)}/dag`;
    } else {
      return NextResponse.json({ error: `Onbekend actietype: ${type}` }, { status: 400 });
    }

    await db.auditLog.create({
      data: {
        actorId: user?.userId ?? null,
        action: `ads_${type}`,
        entity: "google_ads",
        entityId: customerId,
        metadata: { summary, body: { ...body, customerId } },
      },
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { error: "Actie mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
