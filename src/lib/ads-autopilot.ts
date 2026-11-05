// ─── Ads Autopilot engine ───
//
// Bavian/groas-style Google Ads optimization, human-in-the-loop:
// nothing mutates the account until someone clicks a button in the
// dashboard. The monitor (cron) only ever *alerts*, never changes bids,
// budgets or keywords by itself.
//
// Three pillars:
//   1. Waste finder    — search terms that spend without converting
//   2. Budget advisor  — shift daily budget toward the best CPA/ROAS
//   3. Anomaly monitor — yesterday vs the 6 days before, Telegram on shock
//
// Everything read-side goes through queryGoogleAds (GAQL, REST v23);
// everything write-side goes through mutate() below, which is only called
// from the session-gated /api/ads/autopilot/actions route.

import {
  queryGoogleAds,
  fetchDailyTotals,
  getAdAccessToken,
  ADS_ACCOUNTS,
  costPerConversion,
  roasOf,
  ctrOf,
} from "@/lib/google-ads";
import { callDeepSeekJSON } from "@/lib/deepseek";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

// What the business sells — the AI classifier needs this to judge whether a
// search term is relevant. Kept as a constant for the same reason as
// ADS_ACCOUNTS: one business, one dashboard, no settings UI to maintain.
const BUSINESS_CONTEXT = `QuickSolutions Pro (quicksolutionspro.be) is een Belgisch
computer- en smartphone-reparatiebedrijf. Diensten: schermreparatie, batterij
vervangen, dataherstel, virusverwijdering, laptop/PC-reparatie, iPhone- en
Samsung-reparaties, IT-support voor particulieren en kleine bedrijven.
Taal: Nederlands (Vlaanderen). Klanten zoeken lokaal ("laptop reparatie
gent", "iphone scherm vervangen prijs", ...).`;

// ─── Types ───

export interface SearchTermRow {
  term: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
  /** Deterministic verdict from the rule engine. */
  verdict: "waste" | "expensive" | "low_ctr" | "winner" | "neutral";
  /** Why the rule engine flagged it — shown under the term. */
  reason: string;
  /** Filled in by the AI pass; null until then. */
  aiVerdict?: "relevant" | "irrelevant" | "brand" | null;
  aiReason?: string | null;
}

export interface BudgetAdvice {
  campaignId: string;
  campaignName: string;
  budgetResourceName: string | null;
  dailyBudgetMicros: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
  cpa: number | null;
  roas: number | null;
  action: "increase" | "decrease" | "hold";
  suggestedDailyBudgetMicros: number;
  reason: string;
}

export interface KeywordRow {
  resourceName: string;
  text: string;
  matchType: string;
  status: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  cpa: number | null;
  flag: "pause_candidate" | "ok";
  reason: string;
}

export interface Anomaly {
  kind: "spend_spike" | "spend_drop" | "conversions_dead" | "ctr_collapse" | "no_data";
  severity: "critical" | "warning";
  message: string;
}

// ─── GAQL queries ───

function searchTermsQuery(dateRange: string): string {
  return `
    SELECT
      search_term_view.search_term,
      campaign.id, campaign.name,
      ad_group.id, ad_group.name,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date DURING ${dateRange}
      AND campaign.status = 'ENABLED'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `;
}

function campaignBudgetQuery(dateRange: string): string {
  return `
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign_budget.resource_name, campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND segments.date DURING ${dateRange}
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
  `;
}

function keywordsQuery(dateRange: string): string {
  return `
    SELECT
      ad_group_criterion.resource_name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      campaign.id, campaign.name,
      ad_group.name,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM keyword_view
    WHERE campaign.status = 'ENABLED'
      AND ad_group_criterion.status != 'REMOVED'
      AND segments.date DURING ${dateRange}
    ORDER BY metrics.cost_micros DESC
    LIMIT 300
  `;
}

// ─── Read-side fetchers ───

type RawRow = Record<string, never> | Record<string, unknown>;

function num(v: unknown): number {
  return Number(v) || 0;
}

export async function fetchSearchTerms(
  accessToken: string,
  customerId: string,
  dateRange = "LAST_30_DAYS"
): Promise<SearchTermRow[]> {
  const res = await queryGoogleAds(customerId, searchTermsQuery(dateRange), accessToken);
  const rows: SearchTermRow[] = [];

  for (const r of (res.results ?? []) as RawRow[]) {
    const st = (r as Record<string, Record<string, unknown>>).searchTermView ?? {};
    const c = (r as Record<string, Record<string, unknown>>).campaign ?? {};
    const g = (r as Record<string, Record<string, unknown>>).adGroup ?? {};
    const m = (r as Record<string, Record<string, unknown>>).metrics ?? {};
    rows.push({
      term: String(st.searchTerm ?? st.search_term ?? ""),
      campaignId: String(c.id ?? ""),
      campaignName: String(c.name ?? ""),
      adGroupId: String(g.id ?? ""),
      adGroupName: String(g.name ?? ""),
      impressions: num(m.impressions),
      clicks: num(m.clicks),
      costMicros: num(m.costMicros ?? m.cost_micros),
      conversions: num(m.conversions),
      conversionsValue: num(m.conversionsValue ?? m.conversions_value),
      verdict: "neutral",
      reason: "",
    });
  }
  return rows.filter((r) => r.term);
}

/**
 * Deterministic first pass. Thresholds are conservative on purpose: a false
 * "waste" flag costs one click to dismiss, a missed money pit costs real
 * budget every day it goes unnoticed.
 */
export function analyzeSearchTerms(rows: SearchTermRow[]): SearchTermRow[] {
  const totalCost = rows.reduce((s, r) => s + r.costMicros, 0);
  const totalConv = rows.reduce((s, r) => s + r.conversions, 0);
  const avgCpaMicros = totalConv > 0 ? totalCost / totalConv : null;

  return rows.map((r) => {
    const cost = r.costMicros / 1_000_000;
    const ctr = r.impressions > 0 ? r.clicks / r.impressions : 0;
    const cpaMicros = r.conversions > 0 ? r.costMicros / r.conversions : null;
    const roas = r.costMicros > 0 ? r.conversionsValue / r.costMicros : null;

    if (r.conversions >= 2 && roas !== null && roas >= 3) {
      return { ...r, verdict: "winner" as const, reason: `ROAS ${roas.toFixed(1)} — goede term, overweeg als exact keyword` };
    }
    if (r.conversions === 0 && cost >= 15) {
      return { ...r, verdict: "waste" as const, reason: `€${cost.toFixed(2)} gespendeerd, 0 conversies` };
    }
    if (cpaMicros !== null && avgCpaMicros !== null && cpaMicros > avgCpaMicros * 2) {
      return {
        ...r,
        verdict: "expensive" as const,
        reason: `CPA €${(cpaMicros / 1_000_000).toFixed(2)} — meer dan 2× het gemiddelde`,
      };
    }
    if (r.impressions >= 500 && ctr < 0.01) {
      return { ...r, verdict: "low_ctr" as const, reason: `CTR ${(ctr * 100).toFixed(2)}% op ${r.impressions} vertoningen` };
    }
    return { ...r, verdict: "neutral" as const, reason: "" };
  });
}

/**
 * Second pass: DeepSeek judges the flagged terms against the business.
 * Rule verdicts never disappear — the AI verdict is shown next to them, and
 * the button to apply a negative always stays a human click.
 */
export async function classifyTermsWithAi(
  rows: SearchTermRow[]
): Promise<Record<string, { verdict: "relevant" | "irrelevant" | "brand"; reason: string }>> {
  const flagged = rows.filter((r) => r.verdict === "waste" || r.verdict === "expensive");
  if (!flagged.length) return {};

  const list = flagged
    .slice(0, 60)
    .map((r) => `- "${r.term}" (kosten €${(r.costMicros / 1_000_000).toFixed(2)}, kliks ${r.clicks}, conversies ${r.conversions})`)
    .join("\n");

  return callDeepSeekJSON<Record<string, { verdict: "relevant" | "irrelevant" | "brand"; reason: string }>>({
    systemPrompt: `Je bent een Google Ads specialist voor dit bedrijf:\n${BUSINESS_CONTEXT}\n\nBeoordeel zoektermen. Antwoord ALLEEN met een JSON-object: { "zoekterm": { "verdict": "relevant"|"irrelevant"|"brand", "reason": "max 10 woorden NL" } }. "brand" = zoekt op het merk zelf. "irrelevant" = heeft niets met reparatie/IT-diensten te maken of is duidelijk verkeerde intentie (gratis, zelf doen, vacatures, ...).`,
    userPrompt: `Beoordeel deze zoektermen:\n${list}`,
    temperature: 0.2,
    maxTokens: 3000,
  });
}

export async function fetchBudgetAdvice(
  accessToken: string,
  customerId: string,
  dateRange = "LAST_30_DAYS"
): Promise<BudgetAdvice[]> {
  const res = await queryGoogleAds(customerId, campaignBudgetQuery(dateRange), accessToken);

  const map = new Map<string, BudgetAdvice>();
  for (const r of (res.results ?? []) as RawRow[]) {
    const rr = r as Record<string, Record<string, unknown>>;
    const c = rr.campaign ?? {};
    const b = rr.campaignBudget ?? rr.campaign_budget ?? {};
    const m = rr.metrics ?? {};
    const id = String(c.id ?? "");
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        campaignId: id,
        campaignName: String(c.name ?? ""),
        budgetResourceName: b.resourceName ? String(b.resourceName) : b.resource_name ? String(b.resource_name) : null,
        dailyBudgetMicros: num(b.amountMicros ?? b.amount_micros),
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
        cpa: null,
        roas: null,
        action: "hold",
        suggestedDailyBudgetMicros: 0,
        reason: "",
      });
    }
    const row = map.get(id)!;
    row.costMicros += num(m.costMicros ?? m.cost_micros);
    row.conversions += num(m.conversions);
    row.conversionsValue += num(m.conversionsValue ?? m.conversions_value);
  }

  const rows = [...map.values()];
  const totalCost = rows.reduce((s, r) => s + r.costMicros, 0);
  const totalConv = rows.reduce((s, r) => s + r.conversions, 0);
  const avgCpaMicros = totalConv > 0 ? totalCost / totalConv : null;

  return rows.map((r) => {
    r.cpa = r.conversions > 0 ? r.costMicros / r.conversions : null;
    r.roas = r.costMicros > 0 ? r.conversionsValue / r.costMicros : null;
    r.suggestedDailyBudgetMicros = r.dailyBudgetMicros;

    if (r.dailyBudgetMicros <= 0) {
      r.action = "hold";
      r.reason = "Geen eigen campagnebudget (gedeeld of portfolio) — niet aanpasbaar";
      return r;
    }
    const spendsFull = r.costMicros >= r.dailyBudgetMicros * 0.85 * daysIn(dateRange);

    if (avgCpaMicros && r.cpa !== null && r.cpa <= avgCpaMicros * 0.7 && spendsFull) {
      r.action = "increase";
      r.suggestedDailyBudgetMicros = Math.round(r.dailyBudgetMicros * 1.2);
      r.reason = `CPA €${(r.cpa / 1_000_000).toFixed(2)} is ≥30% beter dan gemiddeld én budget raakt op — +20%`;
    } else if (avgCpaMicros && (r.cpa === null ? r.costMicros > 30_000_000 : r.cpa > avgCpaMicros * 1.5)) {
      r.action = "decrease";
      r.suggestedDailyBudgetMicros = Math.max(Math.round(r.dailyBudgetMicros * 0.8), 5_000_000);
      r.reason = r.cpa === null
        ? `€${(r.costMicros / 1_000_000).toFixed(0)} gespendeerd zonder conversies — -20%`
        : `CPA €${(r.cpa / 1_000_000).toFixed(2)} is >50% boven gemiddelde — -20%`;
    } else {
      r.action = "hold";
      r.reason = "Presteert binnen normale marges";
    }
    return r;
  });
}

function daysIn(dateRange: string): number {
  if (dateRange === "LAST_7_DAYS") return 7;
  if (dateRange === "LAST_30_DAYS") return 30;
  return 30;
}

export async function fetchKeywordFlags(
  accessToken: string,
  customerId: string,
  dateRange = "LAST_30_DAYS"
): Promise<KeywordRow[]> {
  const res = await queryGoogleAds(customerId, keywordsQuery(dateRange), accessToken);
  const rows: KeywordRow[] = [];

  let totalCost = 0;
  let totalConv = 0;
  const parsed: KeywordRow[] = [];

  for (const r of (res.results ?? []) as RawRow[]) {
    const rr = r as Record<string, Record<string, unknown>>;
    const crit = rr.adGroupCriterion ?? rr.ad_group_criterion ?? {};
    const kw = (crit.keyword ?? {}) as Record<string, unknown>;
    const c = rr.campaign ?? {};
    const g = rr.adGroup ?? rr.ad_group ?? {};
    const m = rr.metrics ?? {};
    const row: KeywordRow = {
      resourceName: String(crit.resourceName ?? crit.resource_name ?? ""),
      text: String(kw.text ?? ""),
      matchType: String(kw.matchType ?? kw.match_type ?? ""),
      status: String(crit.status ?? ""),
      campaignId: String(c.id ?? ""),
      campaignName: String(c.name ?? ""),
      adGroupName: String(g.name ?? ""),
      impressions: num(m.impressions),
      clicks: num(m.clicks),
      costMicros: num(m.costMicros ?? m.cost_micros),
      conversions: num(m.conversions),
      cpa: null,
      flag: "ok",
      reason: "",
    };
    totalCost += row.costMicros;
    totalConv += row.conversions;
    parsed.push(row);
  }

  const avgCpaMicros = totalConv > 0 ? totalCost / totalConv : null;

  for (const r of parsed) {
    r.cpa = r.conversions > 0 ? r.costMicros / r.conversions : null;
    if (r.status !== "ENABLED") continue;
    if (r.conversions === 0 && r.costMicros >= 25_000_000) {
      r.flag = "pause_candidate";
      r.reason = `€${(r.costMicros / 1_000_000).toFixed(2)} zonder conversies`;
    } else if (avgCpaMicros && r.cpa !== null && r.cpa > avgCpaMicros * 2.5) {
      r.flag = "pause_candidate";
      r.reason = `CPA €${(r.cpa / 1_000_000).toFixed(2)} — 2,5× boven gemiddelde`;
    }
    if (r.resourceName) rows.push(r);
  }
  return rows;
}

// ─── Anomaly detection (monitor cron) ───

/**
 * Yesterday against the six days before it. Same source as the daily digest
 * (fetchDailyTotals) so the numbers on Telegram always match the dashboard.
 */
export async function detectAnomalies(accessToken: string, customerId: string): Promise<Anomaly[]> {
  const { byDate } = await fetchDailyTotals(accessToken, customerId, "LAST_7_DAYS");
  const dates = Object.keys(byDate).sort();
  if (dates.length < 3) {
    return [{ kind: "no_data", severity: "warning", message: "Te weinig data voor anomaliedetectie (< 3 dagen)" }];
  }

  const yesterday = dates[dates.length - 1];
  const y = byDate[yesterday];
  const prev = dates.slice(0, -1).map((d) => byDate[d]);
  const avg = {
    cost: prev.reduce((s, d) => s + d.costMicros, 0) / prev.length,
    clicks: prev.reduce((s, d) => s + d.clicks, 0) / prev.length,
    conversions: prev.reduce((s, d) => s + d.conversions, 0) / prev.length,
    impressions: prev.reduce((s, d) => s + d.impressions, 0) / prev.length,
  };

  const out: Anomaly[] = [];
  const eur = (micros: number) => `€${(micros / 1_000_000).toFixed(2)}`;

  if (avg.cost > 0 && y.costMicros > avg.cost * 1.8) {
    out.push({ kind: "spend_spike", severity: "critical",
      message: `Spend gisteren ${eur(y.costMicros)} — ${Math.round((y.costMicros / avg.cost) * 100)}% van het daggemiddelde (${eur(avg.cost)})` });
  } else if (avg.cost > 0 && y.costMicros < avg.cost * 0.3) {
    out.push({ kind: "spend_drop", severity: "warning",
      message: `Spend gisteren ${eur(y.costMicros)} — slechts ${Math.round((y.costMicros / avg.cost) * 100)}% van normaal. Campagne gepauzeerd?` });
  }

  if (avg.conversions >= 0.5 && y.conversions === 0 && y.costMicros > 10_000_000) {
    out.push({ kind: "conversions_dead", severity: "critical",
      message: `0 conversies gisteren met ${eur(y.costMicros)} spend (gemiddeld ${avg.conversions.toFixed(1)}/dag). Check conversietracking.` });
  }

  const yCtr = ctrOf(y);
  const avgCtr = avg.impressions > 0 ? avg.clicks / avg.impressions : 0;
  if (avgCtr > 0 && yCtr < avgCtr * 0.5 && y.impressions > 100) {
    out.push({ kind: "ctr_collapse", severity: "warning",
      message: `CTR gisteren ${(yCtr * 100).toFixed(2)}% vs normaal ${(avgCtr * 100).toFixed(2)}%. Advertentie afgekeurd of nieuwe concurrent?` });
  }

  return out;
}

// ─── Mutations (write-side, only via /api/ads/autopilot/actions) ───

async function mutate(
  customerId: string,
  accessToken: string,
  operations: Record<string, unknown>[]
): Promise<void> {
  const cleanId = customerId.replace(/-/g, "");
  const cleanManager = (process.env.GOOGLE_ADS_MANAGER_ID || "307-370-2998").replace(/-/g, "");
  const response = await fetch(`${GOOGLE_ADS_API}/customers/${cleanId}/googleAds:mutate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": process.env.GOOGLE_ADS_DEV_TOKEN || "",
      "login-customer-id": cleanManager,
    },
    body: JSON.stringify({ mutateOperations: operations }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Ads mutatie mislukt: ${err}`);
  }
}

/** Campaign-level negative keywords (PHRASE match — exact is too easy to
 *  sidestep with a plural or typo, broad negatives are a loaded gun). */
export async function addNegativeKeywords(
  customerId: string,
  campaignId: string,
  terms: string[]
): Promise<void> {
  const cleanId = customerId.replace(/-/g, "");
  const operations = terms.map((text) => ({
    campaignCriterionOperation: {
      create: {
        campaign: `customers/${cleanId}/campaigns/${campaignId}`,
        negative: true,
        keyword: { text, matchType: "PHRASE" },
      },
    },
  }));
  await mutate(customerId, await getAdAccessToken(), operations);
}

export async function pauseKeyword(customerId: string, criterionResourceName: string): Promise<void> {
  await mutate(customerId, await getAdAccessToken(), [
    {
      adGroupCriterionOperation: {
        update: { resourceName: criterionResourceName, status: "PAUSED" },
        updateMask: "status",
      },
    },
  ]);
}

export async function setCampaignBudget(
  customerId: string,
  budgetResourceName: string,
  amountMicros: number
): Promise<void> {
  await mutate(customerId, await getAdAccessToken(), [
    {
      campaignBudgetOperation: {
        update: { resourceName: budgetResourceName, amountMicros: String(amountMicros) },
        updateMask: "amount_micros",
      },
    },
  ]);
}

export { ADS_ACCOUNTS };
