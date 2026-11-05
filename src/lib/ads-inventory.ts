// ─── Account inventory: campaigns, impression share, negative keywords ───
//
// Read-side inventory for the Bavian-parity modules. Every query here was
// probed against the live account before implementation:
//   ✅ campaign inventory (start_date/end_date do NOT exist in v23 — omitted)
//   ✅ search impression share / lost-to-rank / lost-to-budget per day
//   ✅ campaign-level negatives and shared-set negatives
//   ❌ auction_insight_* competitor metrics (allowlist-gated, see ads-auction.ts)

import {
  queryGoogleAds,
  getAdAccessToken,
} from "@/lib/google-ads";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

// ─── Types ───

export interface CampaignRow {
  campaignId: string;
  name: string;
  status: string; // ENABLED | PAUSED | ...
  channelType: string; // SEARCH | PERFORMANCE_MAX | ...
  biddingStrategy: string;
  dailyBudgetMicros: number;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
}

export interface NegativeRow {
  scope: "campaign" | "shared";
  resourceName: string;
  text: string;
  matchType: string;
  /** Campaign name for campaign-scope, shared-set name for shared-scope. */
  container: string;
  /** For shared sets: campaigns the set is attached to. */
  affectedCampaigns: string[];
}

export interface ImpressionSharePoint {
  date: string;
  /** Impression-weighted averages across enabled campaigns, 0..1. null = no data. */
  share: number | null;
  lostRank: number | null;
  lostBudget: number | null;
}

// ─── Campaign inventory ───

type RawRow = Record<string, unknown>;

function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

function num(v: unknown): number {
  return Number(v) || 0;
}

export async function fetchCampaignInventory(
  accessToken: string,
  customerId: string,
  clause = "DURING LAST_30_DAYS"
): Promise<CampaignRow[]> {
  const res = await queryGoogleAds(customerId, `
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type, campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date ${clause}
    ORDER BY metrics.cost_micros DESC
    LIMIT 300
  `, accessToken);

  const map = new Map<string, CampaignRow>();
  for (const r of (res.results ?? []) as RawRow[]) {
    const c = rec(r.campaign);
    const b = rec(r.campaignBudget ?? r.campaign_budget);
    const m = rec(r.metrics);
    const id = String(c.id ?? "");
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        campaignId: id,
        name: String(c.name ?? ""),
        status: String(c.status ?? ""),
        channelType: String(c.advertisingChannelType ?? c.advertising_channel_type ?? ""),
        biddingStrategy: String(c.biddingStrategyType ?? c.bidding_strategy_type ?? ""),
        dailyBudgetMicros: num(b.amountMicros ?? b.amount_micros),
        impressions: 0,
        clicks: 0,
        costMicros: 0,
        conversions: 0,
        conversionsValue: 0,
      });
    }
    const row = map.get(id)!;
    row.impressions += num(m.impressions);
    row.clicks += num(m.clicks);
    row.costMicros += num(m.costMicros ?? m.cost_micros);
    row.conversions += num(m.conversions);
    row.conversionsValue += num(m.conversionsValue ?? m.conversions_value);
  }
  return [...map.values()];
}

// ─── Impression share series ───

/**
 * Daily impression-share picture for the whole account. Google reports IS per
 * campaign; the account view is an impression-weighted average (the same way
 * the Google Ads UI aggregates it). Only ENABLED campaigns carry live IS.
 */
export async function fetchImpressionShareSeries(
  accessToken: string,
  customerId: string,
  clause = "DURING LAST_30_DAYS"
): Promise<ImpressionSharePoint[]> {
  const res = await queryGoogleAds(customerId, `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.advertising_channel_type = 'SEARCH'
      AND segments.date ${clause}
    ORDER BY segments.date ASC
    LIMIT 2000
  `, accessToken);

  const byDate = new Map<string, { w: number; share: number; rank: number; budget: number }>();
  for (const r of (res.results ?? []) as RawRow[]) {
    const date = String(rec(r.segments).date ?? "");
    const m = rec(r.metrics);
    const impr = num(m.impressions);
    const share = m.searchImpressionShare;
    if (!date || share === undefined || share === null) continue;
    const w = impr || 1;
    const cur = byDate.get(date) ?? { w: 0, share: 0, rank: 0, budget: 0 };
    cur.w += w;
    cur.share += Number(share) * w;
    cur.rank += num(m.searchRankLostImpressionShare ?? m.search_rank_lost_impression_share) * w;
    cur.budget += num(m.searchBudgetLostImpressionShare ?? m.search_budget_lost_impression_share) * w;
    byDate.set(date, cur);
  }

  return [...byDate.entries()].map(([date, d]) => ({
    date,
    share: d.share / d.w,
    lostRank: d.rank / d.w,
    lostBudget: d.budget / d.w,
  }));
}

// ─── Negative keywords ───

export async function fetchNegatives(
  accessToken: string,
  customerId: string
): Promise<NegativeRow[]> {
  // Campaign-level negatives.
  const campRes = await queryGoogleAds(customerId, `
    SELECT
      campaign.id, campaign.name,
      campaign_criterion.resource_name,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign_criterion.negative = TRUE
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
    LIMIT 1000
  `, accessToken);

  const rows: NegativeRow[] = [];
  for (const r of (campRes.results ?? []) as RawRow[]) {
    const crit = rec(r.campaignCriterion ?? r.campaign_criterion);
    const kw = rec(crit.keyword);
    const text = String(kw.text ?? "");
    if (!text) continue;
    rows.push({
      scope: "campaign",
      resourceName: String(crit.resourceName ?? crit.resource_name ?? ""),
      text,
      matchType: String(kw.matchType ?? kw.match_type ?? ""),
      container: String(rec(r.campaign).name ?? ""),
      affectedCampaigns: [],
    });
  }

  // Shared-set negatives + which campaigns each set is attached to.
  let setNames = new Map<string, string>();
  let setCampaigns = new Map<string, string[]>();
  try {
    const linkRes = await queryGoogleAds(customerId, `
      SELECT campaign.name, campaign_shared_set.shared_set
      FROM campaign_shared_set
      WHERE campaign.status != 'REMOVED'
      LIMIT 500
    `, accessToken);
    for (const r of (linkRes.results ?? []) as RawRow[]) {
      const setRef = String(rec(r.campaignSharedSet ?? r.campaign_shared_set).sharedSet ?? "");
      const setId = setRef.split("/").pop() ?? "";
      const campName = String(rec(r.campaign).name ?? "");
      if (!setId) continue;
      setCampaigns.set(setId, [...(setCampaigns.get(setId) ?? []), campName]);
    }

    const sharedRes = await queryGoogleAds(customerId, `
      SELECT
        shared_set.id, shared_set.name,
        shared_criterion.resource_name,
        shared_criterion.keyword.text,
        shared_criterion.keyword.match_type
      FROM shared_criterion
      WHERE shared_criterion.type = 'KEYWORD'
      LIMIT 1000
    `, accessToken);
    setNames = new Map();
    const sharedRows: NegativeRow[] = [];
    for (const r of (sharedRes.results ?? []) as RawRow[]) {
      const set = rec(r.sharedSet ?? r.shared_set);
      const crit = rec(r.sharedCriterion ?? r.shared_criterion);
      const kw = rec(crit.keyword);
      const text = String(kw.text ?? "");
      if (!text) continue;
      const setId = String(set.id ?? "");
      setNames.set(setId, String(set.name ?? ""));
      sharedRows.push({
        scope: "shared",
        resourceName: String(crit.resourceName ?? crit.resource_name ?? ""),
        text,
        matchType: String(kw.matchType ?? kw.match_type ?? ""),
        container: String(set.name ?? ""),
        affectedCampaigns: setCampaigns.get(setId) ?? [],
      });
    }
    rows.push(...sharedRows);
  } catch (err) {
    // Shared sets are an enrichment — campaign negatives alone are still useful.
    console.error("Shared-set negatives lezen mislukt:", err);
  }

  return rows;
}

// ─── Mutations (called only from /api/ads/autopilot/actions) ───

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

/** Unblock a search term: remove a campaign-level or shared-set negative.
 *  Human-gated via the actions route — this is "allow this search again". */
export async function removeNegative(customerId: string, resourceName: string): Promise<void> {
  const isShared = resourceName.includes("/sharedCriteria/");
  await mutate(customerId, await getAdAccessToken(), [
    isShared
      ? { sharedCriterionOperation: { remove: resourceName } }
      : { campaignCriterionOperation: { remove: resourceName } },
  ]);
}
