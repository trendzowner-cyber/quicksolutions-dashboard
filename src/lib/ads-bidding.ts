// ─── Bidding overview — per-campaign bid strategy, read-only ───
// Mirrors Bavian's Bidding page: what is each campaign aiming at right now,
// and which shared portfolio strategy it hangs under.

import { queryGoogleAds } from "@/lib/google-ads";

export interface BiddingRow {
  campaignId: string;
  campaignName: string;
  channelType: string;
  status: string;
  strategyType: string;      // e.g. TARGET_SPEND, MAXIMIZE_CONVERSIONS, MANUAL_CPC
  strategyName: string | null; // shared portfolio strategy name, if any
  targetCpaMicros: number | null;
  targetRoas: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  TARGET_SPEND: "Max. klikken (Target Spend)",
  MAXIMIZE_CONVERSIONS: "Max. conversies",
  MAXIMIZE_CONVERSION_VALUE: "Max. conversiewaarde",
  TARGET_CPA: "Doel-CPA",
  TARGET_ROAS: "Doel-ROAS",
  TARGET_IMPRESSION_SHARE: "Doel-vertoningsaandeel",
  MANUAL_CPC: "Handmatig CPC",
  ENHANCED_CPC: "Verbeterde CPC",
  TARGET_CPM: "Doel-CPM",
};

export function biddingTypeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t.replace(/_/g, " ").toLowerCase();
}

export async function fetchBiddingOverview(
  accessToken: string,
  customerId: string
): Promise<BiddingRow[]> {
  const res = await queryGoogleAds(customerId, `
    SELECT
      campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      campaign.bidding_strategy_type, campaign.bidding_strategy,
      campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY campaign.name ASC
    LIMIT 200
  `, accessToken);

  const rows: BiddingRow[] = [];
  const strategyRns = new Set<string>();

  for (const r of (res.results ?? []) as Record<string, Record<string, unknown>>[]) {
    const c = r.campaign ?? {};
    const strategyRn = (c.biddingStrategy ?? c.bidding_strategy) as string | undefined;
    if (strategyRn) strategyRns.add(strategyRn);

    rows.push({
      campaignId: String(c.id ?? ""),
      campaignName: String(c.name ?? ""),
      channelType: String(c.advertisingChannelType ?? c.advertising_channel_type ?? ""),
      status: String(c.status ?? ""),
      strategyType: String(c.biddingStrategyType ?? c.bidding_strategy_type ?? ""),
      strategyName: strategyRn ? `__rn__${strategyRn}` : null, // resolved below
      targetCpaMicros: numOrNull(rec(c.targetCpa ?? c.target_cpa)?.targetCpaMicros ?? rec(c.targetCpa ?? c.target_cpa)?.target_cpa_micros),
      targetRoas: numOrNull(rec(c.targetRoas ?? c.target_roas)?.targetRoas ?? rec(c.targetRoas ?? c.target_roas)?.target_roas),
    });
  }

  // Resolve shared portfolio strategy names + targets in one extra query.
  if (strategyRns.size) {
    try {
      const sr = await queryGoogleAds(customerId, `
        SELECT bidding_strategy.id, bidding_strategy.name, bidding_strategy.type,
               bidding_strategy.target_cpa.target_cpa_micros,
               bidding_strategy.target_roas.target_roas
        FROM bidding_strategy LIMIT 100
      `, accessToken);
      const byRn = new Map<string, { name: string; cpa: number | null; roas: number | null }>();
      for (const r of (sr.results ?? []) as Record<string, Record<string, unknown>>[]) {
        const b = r.biddingStrategy ?? r.bidding_strategy ?? {};
        const rn = `customers/${customerId.replace(/-/g, "")}/biddingStrategies/${b.id}`;
        byRn.set(rn, {
          name: String(b.name ?? ""),
          cpa: numOrNull(rec(b.targetCpa ?? b.target_cpa)?.targetCpaMicros ?? rec(b.targetCpa ?? b.target_cpa)?.target_cpa_micros),
          roas: numOrNull(rec(b.targetRoas ?? b.target_roas)?.targetRoas ?? rec(b.targetRoas ?? b.target_roas)?.target_roas),
        });
      }
      for (const row of rows) {
        if (row.strategyName?.startsWith("__rn__")) {
          const hit = byRn.get(row.strategyName.slice(6));
          row.strategyName = hit?.name ?? null;
          row.targetCpaMicros ??= hit?.cpa ?? null;
          row.targetRoas ??= hit?.roas ?? null;
        }
      }
    } catch {
      for (const row of rows) {
        if (row.strategyName?.startsWith("__rn__")) row.strategyName = null;
      }
    }
  }

  return rows;
}

function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}
function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
