// ─── Budget cap + AI allocation ───
// Bavian's Budget page: one total daily ceiling across all campaigns, the AI
// distributes it per campaign based on performance, and a free-text strategy
// ("prioritise Gent", "max €20/day on Overig") goes into Memory as a rule.

import { db } from "@/lib/db";
import { fetchBudgetAdvice } from "@/lib/ads-autopilot";
import { callDeepSeekJSON } from "@/lib/deepseek";
import { getMemory } from "@/lib/ads-agent";

// €500/day per-campaign ceiling — same guard as everywhere else
const MAX_CAMPAIGN_DAILY_MICROS = 500_000_000;
const MIN_CAMPAIGN_DAILY_MICROS = 1_000_000; // €1/day floor

export async function getBudgetCap(): Promise<number | null> {
  const row = await db.adsBudgetCap.findUnique({ where: { id: "main" } });
  return row?.capMicros ?? null;
}

export async function setBudgetCap(capMicros: number): Promise<void> {
  await db.adsBudgetCap.upsert({
    where: { id: "main" },
    create: { id: "main", capMicros },
    update: { capMicros },
  });
}

export interface BudgetAllocation {
  campaignId: string;
  campaignName: string;
  budgetResourceName: string;
  currentDailyMicros: number;
  suggestedDailyMicros: number;
  reason: string;
}

/** AI distributes the total cap across campaigns. Validated server-side:
 *  every campaign must come from the real data, total must not exceed the
 *  cap, per-campaign amounts clamped to the €1–€500/day guardrails. */
export async function allocateBudget(
  accessToken: string,
  customerId: string,
  capMicros: number
): Promise<BudgetAllocation[]> {
  const [advice, mem] = await Promise.all([
    fetchBudgetAdvice(accessToken, customerId, "LAST_30_DAYS"),
    getMemory(),
  ]);

  // Only campaigns with a real budget resource can be adjusted
  const eligible = advice.filter((b) => b.budgetResourceName);
  if (!eligible.length) return [];

  const campaignList = eligible
    .map((b) =>
      `- id=${b.campaignId} | ${b.campaignName} | huidig €${(b.dailyBudgetMicros / 1e6).toFixed(0)}/dag | CPA ${b.cpa != null ? `€${b.cpa.toFixed(0)}` : "—"} | ROAS ${b.roas != null ? b.roas.toFixed(1) : "—"} | advies: ${b.action} → €${(b.suggestedDailyBudgetMicros / 1e6).toFixed(0)}/dag | resource=${b.budgetResourceName}`
    )
    .join("\n");

  const memBlock = [
    mem.rules.length ? `REGELS (altijd volgen):\n${mem.rules.map((r) => `- ${r}`).join("\n")}` : "",
    mem.facts.length ? `FEITEN:\n${mem.facts.map((f) => `- ${f}`).join("\n")}` : "",
    mem.profile ? `PROFIEL:\n${mem.profile}` : "",
  ].filter(Boolean).join("\n\n");

  const raw = await callDeepSeekJSON<{
    allocation: { campaignId: string; dailyEuros: number; reason: string }[];
  }>({
    systemPrompt: `Je bent de budget-allocator van een Google Ads-account. Verdeel het totale dagbudget over de campagnes. Prestaties tellen (CPA/ROAS), maar REGELS en FEITEN uit het geheugen gaan altijd voor. Het totaal mag het plafond NIET overschrijden — liever eronder blijven als sommige campagnes het budget niet volmaken. Elke campagne min €1, max €500 per dag. Antwoord als JSON {"allocation":[{"campaignId":"...","dailyEuros":12.5,"reason":"korte NL reden"}]}. Neem ALLEEN campaignIds uit de lijst.`,
    userPrompt: `Totaal dagbudget-plafond: €${(capMicros / 1e6).toFixed(2)}\n\nCampagnes:\n${campaignList}${memBlock ? `\n\n${memBlock}` : ""}`,
    temperature: 0.2,
    maxTokens: 2000,
  });

  // Validate: only real campaign IDs, clamp amounts, enforce cap
  const byId = new Map(eligible.map((b) => [b.campaignId, b]));
  let totalMicros = 0;
  const out: BudgetAllocation[] = [];

  for (const a of (raw.allocation ?? []).slice(0, eligible.length)) {
    const camp = byId.get(String(a.campaignId));
    if (!camp?.budgetResourceName) continue;
    let micros = Math.round(Number(a.dailyEuros) * 1e6);
    if (!Number.isFinite(micros)) continue;
    micros = Math.max(MIN_CAMPAIGN_DAILY_MICROS, Math.min(MAX_CAMPAIGN_DAILY_MICROS, micros));
    // Skip if no change (within €0.50)
    if (Math.abs(micros - camp.dailyBudgetMicros) < 500_000) continue;
    if (totalMicros + micros > capMicros) {
      micros = Math.max(MIN_CAMPAIGN_DAILY_MICROS, capMicros - totalMicros);
      if (micros <= 0) break;
    }
    totalMicros += micros;
    out.push({
      campaignId: camp.campaignId,
      campaignName: camp.campaignName,
      budgetResourceName: camp.budgetResourceName,
      currentDailyMicros: camp.dailyBudgetMicros,
      suggestedDailyMicros: micros,
      reason: String(a.reason ?? ""),
    });
  }
  return out;
}
