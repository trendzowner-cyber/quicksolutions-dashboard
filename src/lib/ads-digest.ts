// Daily Google Ads digest for Telegram.
//
// Built like the weekly review digest (src/lib/review-digest.ts): collect the
// real numbers, let DeepSeek write the verdict, and fall back to the raw stats
// if the AI call fails — the numbers are the product, the prose is a bonus.
//
// Yesterday is compared against the day before, because that is the only
// complete day the API reports; today's figures are still filling in.

import { callDeepSeek } from "@/lib/deepseek";
import {
  ADS_ACCOUNTS,
  AdsAuthError,
  accountLabel,
  averageCpcOf,
  costPerConversion,
  ctrOf,
  fetchDailyTotals,
  getAdAccessToken,
  roasOf,
  type AdsDayTotals,
} from "@/lib/google-ads";
import { brusselsNow, formatISOLongEN, shiftISO } from "@/lib/recurring";

const EMPTY_DAY: AdsDayTotals = {
  impressions: 0,
  clicks: 0,
  costMicros: 0,
  conversions: 0,
  conversionsValue: 0,
  allConversions: 0,
  impressionShare: null,
  budgetLostIs: null,
  rankLostIs: null,
  absoluteTopIs: null,
};

export interface AdsDigestResult {
  ok: boolean;
  text: string;
}

const eurFmt = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });

function eur(micros: number): string {
  return eurFmt.format(micros / 1_000_000);
}

function pct(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** "▲ 12%" / "▼ 8%" / "—" — a percentage change, direction first. */
function delta(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "new" : "—";
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return "—";
  const arrow = change > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(change * 100).toFixed(0)}%`;
}

function ratioChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return (current - previous) / previous;
}

/** Anomaly rules — only patterns worth a human's attention, not every wobble. */
function detectSignals(
  label: string,
  today: AdsDayTotals,
  before: AdsDayTotals
): string[] {
  const out: string[] = [];
  const spend = today.costMicros / 1_000_000;
  const prevSpend = before.costMicros / 1_000_000;
  const convDelta = ratioChange(today.conversions, before.conversions);
  const spendDelta = ratioChange(spend, prevSpend);
  const cpa = costPerConversion(today);
  const prevCpa = costPerConversion(before);

  if (spendDelta !== null && spendDelta > 0.3 && convDelta !== null && Math.abs(convDelta) < 0.1) {
    out.push(
      `${label}: cost ${delta(spend, prevSpend)} (${eur(today.costMicros)}) with no extra conversions`
    );
  }
  if (convDelta !== null && convDelta < -0.3) {
    out.push(
      `${label}: conversions ${delta(today.conversions, before.conversions)} (${numFmt.format(today.conversions)} vs ${numFmt.format(before.conversions)})`
    );
  }
  if (cpa !== null && prevCpa !== null && cpa > prevCpa * 1.4) {
    out.push(
      `${label}: cost per conversion ${eurFmt.format(cpa)} (was ${eurFmt.format(prevCpa)})`
    );
  }
  if (today.conversions === 0 && spend > 10) {
    out.push(`${label}: not a single conversion on ${eur(today.costMicros)} of spend`);
  }
  return out;
}

function accountBlock(label: string, d: AdsDayTotals, prev: AdsDayTotals): string {
  const cpa = costPerConversion(d);
  const roas = roasOf(d);
  const lines = [
    label,
    `  Cost: ${eur(d.costMicros)} (${delta(d.costMicros, prev.costMicros)})`,
    `  Clicks: ${numFmt.format(d.clicks)} (${delta(d.clicks, prev.clicks)})`,
    `  Impressions: ${numFmt.format(d.impressions)} (${delta(d.impressions, prev.impressions)})`,
    `  Conversions: ${numFmt.format(d.conversions)} (${delta(d.conversions, prev.conversions)})`,
    `  CTR: ${(ctrOf(d) * 100).toFixed(2)}%   CPC: ${eurFmt.format(averageCpcOf(d))}`,
  ];
  if (cpa !== null) lines.push(`  Cost per conversion: ${eurFmt.format(cpa)}`);
  if (roas !== null) lines.push(`  Revenue: ${eurFmt.format(d.conversionsValue)}   ROAS: ${roas.toFixed(1)}x`);
  // Auction position, always printed when the account reports it: impression
  // share says how much of the auction you won, and the top-slot line says
  // whether you won the part that actually gets clicked. This account runs a
  // target-impression-share portfolio strategy, so position is the whole point.
  if (d.impressionShare !== null) {
    lines.push(`  Search impression share: ${pct(d.impressionShare, 0)}`);
  }
  if (d.absoluteTopIs !== null) {
    lines.push(`  Top slot (absolute top): ${pct(d.absoluteTopIs, 0)}`);
  }
  const lost = [
    d.budgetLostIs !== null ? `${pct(d.budgetLostIs, 0)} to budget` : null,
    d.rankLostIs !== null ? `${pct(d.rankLostIs, 0)} to rank` : null,
  ].filter(Boolean);
  if (lost.length) lines.push(`  Lost: ${lost.join(", ")}`);
  return lines.join("\n");
}

export async function buildAdsDigest(): Promise<AdsDigestResult> {
  const today = brusselsNow().date;
  const yesterday = shiftISO(today, -1);
  const dayBefore = shiftISO(today, -2);

  let accessToken: string;
  try {
    accessToken = await getAdAccessToken();
  } catch (err) {
    if (err instanceof AdsAuthError) {
      return { ok: false, text: `Ads report skipped — ${err.message}` };
    }
    throw err;
  }

  const perAccount: {
    label: string;
    d: AdsDayTotals;
    prev: AdsDayTotals;
    error?: string;
  }[] = [];

  for (const id of ADS_ACCOUNTS) {
    const label = accountLabel(id);
    try {
      const result = await fetchDailyTotals(accessToken, id, "LAST_7_DAYS");
      perAccount.push({
        label,
        d: result.byDate[yesterday] ?? EMPTY_DAY,
        prev: result.byDate[dayBefore] ?? EMPTY_DAY,
      });
    } catch (err) {
      perAccount.push({ label, d: EMPTY_DAY, prev: EMPTY_DAY, error: String(err).slice(0, 200) });
    }
  }

  const usable = perAccount.filter((a) => !a.error);
  const signals = usable.flatMap((a) => detectSignals(a.label, a.d, a.prev));

  const header = `Ads report — ${formatISOLongEN(yesterday)}`;
  const body = perAccount
    .map((a) => (a.error ? `${a.label}\n  Failed to fetch: ${a.error}` : accountBlock(a.label, a.d, a.prev)))
    .join("\n\n");

  const totalSpend = usable.reduce((s, a) => s + a.d.costMicros, 0);
  const totalConv = usable.reduce((s, a) => s + a.d.conversions, 0);
  const totalPrevSpend = usable.reduce((s, a) => s + a.prev.costMicros, 0);
  const totalPrevConv = usable.reduce((s, a) => s + a.prev.conversions, 0);

  const statLines = [
    `Total: ${eur(totalSpend)} (${delta(totalSpend, totalPrevSpend)}), ${numFmt.format(totalConv)} conversions (${delta(totalConv, totalPrevConv)})`,
    "",
    body,
  ];

  if (signals.length) {
    statLines.push("", "Signals:", ...signals.map((s) => `  • ${s}`));
  } else if (usable.length) {
    statLines.push("", "Signals: nothing unusual.");
  }

  const stats = statLines.join("\n");

  // The AI writes the judgement, never the numbers — and a failed call must
  // still leave a usable digest.
  let verdict: string | null = null;
  try {
    verdict = await callDeepSeek({
      systemPrompt:
        "You are a Google Ads analyst for a Belgian refurbished-electronics shop (QuickSolutionsPro). " +
        "You get yesterday's figures per account, with the day before as the comparison. " +
        "Write 2 to 3 sentences in English: what stands out and what should happen today. " +
        "Only state what is in the figures, invent nothing. No bullet points, no markdown, no emoji.",
      userPrompt: stats,
      temperature: 0.4,
      maxTokens: 400,
    });
  } catch {
    verdict = null;
  }

  const text = verdict ? `${header}\n\n${stats}\n\nAI: ${verdict.trim()}` : `${header}\n\n${stats}`;
  return { ok: usable.length > 0, text };
}
