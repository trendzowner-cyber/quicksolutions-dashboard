import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAdAccessToken, getAdRefreshToken, ADS_ACCOUNTS } from "@/lib/google-ads";
import { getBudgetCap, setBudgetCap, allocateBudget } from "@/lib/ads-budget";

export const maxDuration = 60;

// GET /api/ads/budget — current cap + per-campaign allocation advice
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const capMicros = await getBudgetCap();
    return NextResponse.json({ capMicros, capEuros: capMicros != null ? capMicros / 1e6 : null });
  } catch (err) {
    return NextResponse.json({ error: "Budget ophalen mislukt", details: String(err) }, { status: 500 });
  }
}

// POST /api/ads/budget — set cap, run AI allocation, save strategy to memory
// body: { capEuros?: number, strategy?: string, allocate?: boolean, accountId?: string }
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const accountId = String(body?.accountId ?? "") || ADS_ACCOUNTS[0];
    const user = await getSessionUser();

    // 1. Save the cap
    if (typeof body.capEuros === "number" && body.capEuros > 0) {
      const capMicros = Math.round(body.capEuros * 1e6);
      await setBudgetCap(capMicros);
      await db.auditLog.create({
        data: {
          actorId: user?.userId ?? null,
          action: "ads_budget_cap_set",
          entity: "ads",
          metadata: { capEuros: body.capEuros },
        },
      });
    }

    // 2. Save the strategy as a memory rule the agent always follows
    if (typeof body.strategy === "string" && body.strategy.trim()) {
      const text = body.strategy.trim().slice(0, 500);
      await db.adsAgentMemory.create({
        data: { kind: "rule", text: `Budgetstrategie: ${text}`, source: "user" },
      });
      await db.auditLog.create({
        data: {
          actorId: user?.userId ?? null,
          action: "ads_budget_strategy",
          entity: "ads",
          metadata: { strategy: text },
        },
      });
    }

    // 3. AI allocation — creates set_budget proposals for human approval
    let allocation: { campaignId: string; campaignName: string; suggestedDailyMicros: number; reason: string }[] = [];
    if (body.allocate) {
      const cap = await getBudgetCap();
      if (!cap) {
        return NextResponse.json({ error: "Stel eerst een totaal dagbudget in" }, { status: 400 });
      }
      if (!(await getAdRefreshToken())) {
        return NextResponse.json({ error: "Google Ads niet verbonden" }, { status: 500 });
      }
      const accessToken = await getAdAccessToken();
      const alloc = await allocateBudget(accessToken, accountId, cap);

      // Create pending proposals with the same dedupe as the agent
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      for (const a of alloc) {
        const fingerprint = `set_budget:${a.campaignId}:${a.suggestedDailyMicros}`;
        const existing = await db.adsAgentProposal.findFirst({
          where: {
            fingerprint,
            OR: [
              { status: "pending" },
              { status: "rejected", decidedAt: { gte: weekAgo } },
              { status: "executed", executedAt: { gte: weekAgo } },
            ],
          },
        });
        if (existing) continue;
        await db.adsAgentProposal.create({
          data: {
            fingerprint,
            type: "set_budget",
            title: `Budget ${a.campaignName} → €${(a.suggestedDailyMicros / 1e6).toFixed(0)}/dag`,
            reason: a.reason || `Huidig €${(a.currentDailyMicros / 1e6).toFixed(0)}/dag.`,
            payload: {
              customerId: accountId,
              budgetResourceName: a.budgetResourceName,
              amountMicros: a.suggestedDailyMicros,
              label: a.campaignName,
            },
          },
        });
      }
      allocation = alloc.map((a) => ({
        campaignId: a.campaignId,
        campaignName: a.campaignName,
        suggestedDailyMicros: a.suggestedDailyMicros,
        reason: a.reason,
      }));
      await db.auditLog.create({
        data: {
          actorId: user?.userId ?? null,
          action: "ads_budget_allocate",
          entity: "ads",
          metadata: { proposals: allocation.length, capEuros: cap / 1e6 },
        },
      });
    }

    const capMicros = await getBudgetCap();
    return NextResponse.json({
      ok: true,
      capMicros,
      capEuros: capMicros != null ? capMicros / 1e6 : null,
      allocation,
    });
  } catch (err) {
    console.error("Budget route mislukt:", err);
    return NextResponse.json({ error: "Budget mislukt", details: String(err) }, { status: 500 });
  }
}
