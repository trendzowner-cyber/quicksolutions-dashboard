// Google Ads API client
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/base-url";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

// Resolved once, and used by both halves of the flow. It was a literal in each
// half before, which is the shape of bug that only shows up in production: the
// authorization request goes to the old hostname, the token exchange to the new
// one, and Google rejects the exchange with `redirect_uri_mismatch` after the
// user has already clicked through the consent screen.
const REDIRECT_URI = `${appBaseUrl()}/api/ads/oauth-callback`;

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function getClientId(): string { return getEnv("GOOGLE_ADS_CLIENT_ID"); }
function getClientSecret(): string { return getEnv("GOOGLE_ADS_CLIENT_SECRET"); }
function getDevToken(): string { return getEnv("GOOGLE_ADS_DEV_TOKEN"); }
// Optional: the manager (MCC) account. Read straight from process.env — via
// getEnv() the throw would fire before the "||" could apply, making the default
// unreachable and the whole integration fail on a missing optional var.
function getManagerId(): string { return process.env.GOOGLE_ADS_MANAGER_ID || "307-370-2998"; }

export function getAuthUrl(customerId: string, state?: string) {
  const redirectUri = REDIRECT_URI;
  const scope = "https://www.googleapis.com/auth/adwords";
  const params = new URLSearchParams({
    client_id: getClientId(), redirect_uri: redirectUri, response_type: "code",
    scope, access_type: "offline", prompt: "consent",
    login_customer_hint: customerId,
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: getClientId(), client_secret: getClientSecret(),
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code" }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`OAuth error: ${err}`); }
  return response.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: getClientId(), client_secret: getClientSecret(),
      refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("Failed to refresh token");
  return response.json();
}

export async function queryGoogleAds(customerId: string, query: string, accessToken: string) {
  const cleanId = customerId.replace(/-/g, "");
  const cleanManager = getManagerId().replace(/-/g, "");
  const response = await fetch(`${GOOGLE_ADS_API}/customers/${cleanId}/googleAds:search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`,
      "developer-token": getDevToken(), "login-customer-id": cleanManager },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`Google Ads API error: ${err}`); }
  return response.json();
}

// Build campaign query with optional date filter
export function buildCampaignQuery(dateRange: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let dateFilter = "WHERE campaign.status != 'REMOVED'";
  if (dateRange === "TODAY") dateFilter += ` AND segments.date = '${today}'`;
  else if (dateRange === "YESTERDAY") dateFilter += ` AND segments.date = '${yesterday}'`;
  else if (dateRange === "LAST_7_DAYS") dateFilter += " AND segments.date DURING LAST_7_DAYS";
  else if (dateRange === "LAST_30_DAYS") dateFilter += " AND segments.date DURING LAST_30_DAYS";
  else if (dateRange === "THIS_MONTH") dateFilter += " AND segments.date DURING THIS_MONTH";
  else if (dateRange === "LAST_MONTH") dateFilter += " AND segments.date DURING LAST_MONTH";
  // Default: no date filter = all time

  return `
    SELECT
      campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.conversions_value, metrics.impressions,
      segments.date
    FROM campaign
    ${dateFilter}
    ORDER BY metrics.impressions DESC
    LIMIT 100
  `;
}

export function buildAccountQuery(dateRange: string) {
  let dateFilter = "";
  if (dateRange === "LAST_7_DAYS") dateFilter = "WHERE segments.date DURING LAST_7_DAYS";
  else if (dateRange === "LAST_30_DAYS") dateFilter = "WHERE segments.date DURING LAST_30_DAYS";
  else if (dateRange === "THIS_MONTH") dateFilter = "WHERE segments.date DURING THIS_MONTH";

  return `
    SELECT
      customer.descriptive_name, customer.id,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.ctr, metrics.average_cpc,
      metrics.conversions_value
    FROM customer
    ${dateFilter}
    LIMIT 1
  `;
}

// ─── Ads token (shared by the campaigns page and the daily digest) ───
//
// The token lives in GoogleToken (scope "adwords"), saved by the OAuth
// callback. Env fallback for legacy setups.

export async function getAdRefreshToken(): Promise<string | null> {
  const stored = await db.googleToken.findUnique({ where: { scope: "adwords" } });
  if (stored?.refreshToken) return stored.refreshToken;
  return process.env.GOOGLE_ADS_REFRESH_TOKEN || null;
}

/** Thrown when Google rejects the refresh token — i.e. the connection is dead
 *  and the user has to click "Google verbinden" again. Callers turn this into
 *  a visible "reconnect" message instead of a silent daily failure. */
export class AdsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsAuthError";
  }
}

/**
 * Returns a fresh access token and rotates the stored row. On a rejected
 * refresh token the stored row is deleted so the OAuth callback can save a new
 * one — keeping a dead token would retry (and fail) forever.
 */
export async function getAdAccessToken(): Promise<string> {
  const refreshToken = await getAdRefreshToken();
  if (!refreshToken) {
    throw new AdsAuthError("Google Ads is niet verbonden — klik op Google verbinden");
  }

  let refreshed: { access_token: string; refresh_token?: string; expires_in?: number };
  try {
    refreshed = await refreshAccessToken(refreshToken);
  } catch (err) {
    await db.googleToken.delete({ where: { scope: "adwords" } }).catch(() => {});
    throw new AdsAuthError(
      `Ads-token geweigerd door Google — opnieuw verbinden nodig (${String(err)})`
    );
  }

  if (refreshed.refresh_token) {
    const expiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : new Date(Date.now() + 3600 * 1000);
    await db.googleToken.upsert({
      where: { scope: "adwords" },
      create: {
        scope: "adwords",
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt,
      },
      update: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt,
      },
    });
  }

  return refreshed.access_token;
}

// ─── Daily totals for the digest ───
//
// The dashboard's campaign page pulls the seven basics. Everything below is
// what the API offers on top of those and what actually answers the client's
// questions: impression share says how much demand you never got to bid on,
// and the two "lost" variants say whether that was the budget's fault or the
// ranking's.

export interface AdsDayTotals {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
  allConversions: number;
  /** Weighted by impressions, since impression share is a ratio per campaign. */
  impressionShare: number | null;
  budgetLostIs: number | null;
  rankLostIs: number | null;
  /** How often the ad held the very first slot, not just any top slot. */
  absoluteTopIs: number | null;
}

export interface AdsDailyResult {
  /** YYYY-MM-DD → totals for that day. */
  byDate: Record<string, AdsDayTotals>;
  totals: AdsDayTotals;
  /** False when Google rejected the enriched columns and we fell back. */
  enriched: boolean;
}

const ENRICHED_METRICS = `
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_absolute_top_impression_share,
      metrics.all_conversions,`;

function dailyQuery(dateRange: string, enriched: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let dateFilter = "WHERE campaign.status != 'REMOVED'";
  if (dateRange === "TODAY") dateFilter += ` AND segments.date = '${today}'`;
  else if (dateRange === "YESTERDAY") dateFilter += ` AND segments.date = '${yesterday}'`;
  else if (dateRange === "LAST_7_DAYS") dateFilter += " AND segments.date DURING LAST_7_DAYS";
  else if (dateRange === "LAST_30_DAYS") dateFilter += " AND segments.date DURING LAST_30_DAYS";

  return `
    SELECT
      campaign.id, campaign.name,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,${enriched ? ENRICHED_METRICS : ""}
      segments.date
    FROM campaign
    ${dateFilter}
    ORDER BY segments.date DESC
    LIMIT 500
  `;
}

function emptyDay(): AdsDayTotals {
  return {
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
}

/** Impression share arrives per campaign; combining them impression-weighted
 *  is the standard approximation (a plain mean would let a 3-impression
 *  campaign weigh as much as the main one). */
function weighted(
  rows: { value: number; weight: number }[]
): number | null {
  const usable = rows.filter((r) => Number.isFinite(r.value) && r.weight > 0);
  if (!usable.length) return null;
  const w = usable.reduce((s, r) => s + r.weight, 0);
  if (w <= 0) return null;
  return usable.reduce((s, r) => s + r.value * r.weight, 0) / w;
}

export async function fetchDailyTotals(
  accessToken: string,
  customerId: string,
  dateRange = "LAST_7_DAYS"
): Promise<AdsDailyResult> {
  let enriched = true;
  let res: { results?: Record<string, unknown>[] };
  try {
    res = await queryGoogleAds(customerId, dailyQuery(dateRange, true), accessToken);
  } catch {
    // Some campaign types reject the impression-share columns outright. A
    // digest with the basic numbers beats no digest at all.
    enriched = false;
    res = await queryGoogleAds(customerId, dailyQuery(dateRange, false), accessToken);
  }

  type RatioRows = { value: number; weight: number }[];

  const byDate: Record<string, AdsDayTotals> = {};
  // Ratio metrics are accumulated per day as weighted rows, then divided once.
  const ratios: Record<
    string,
    { is: RatioRows; budget: RatioRows; rank: RatioRows; top: RatioRows }
  > = {};

  for (const row of res.results ?? []) {
    const m = (row.metrics ?? {}) as Record<string, unknown>;
    const seg = (row.segments ?? {}) as Record<string, unknown>;
    const date = String(seg.date ?? "");
    if (!date) continue;

    const impressions = Number(m.impressions) || 0;
    const day = (byDate[date] ??= emptyDay());
    day.impressions += impressions;
    day.clicks += Number(m.clicks) || 0;
    day.costMicros += Number(m.costMicros ?? m.cost_micros) || 0;
    day.conversions += Number(m.conversions) || 0;
    day.conversionsValue += Number(m.conversionsValue ?? m.conversions_value) || 0;
    day.allConversions += Number(m.allConversions ?? m.all_conversions) || 0;

    if (enriched) {
      const r = (ratios[date] ??= { is: [], budget: [], rank: [], top: [] });
      const share = Number(m.searchImpressionShare ?? m.search_impression_share);
      const budget = Number(
        m.searchBudgetLostImpressionShare ?? m.search_budget_lost_impression_share
      );
      const rank = Number(m.searchRankLostImpressionShare ?? m.search_rank_lost_impression_share);
      const top = Number(
        m.searchAbsoluteTopImpressionShare ?? m.search_absolute_top_impression_share
      );
      if (Number.isFinite(share)) r.is.push({ value: share, weight: impressions });
      if (Number.isFinite(budget)) r.budget.push({ value: budget, weight: impressions });
      if (Number.isFinite(rank)) r.rank.push({ value: rank, weight: impressions });
      if (Number.isFinite(top)) r.top.push({ value: top, weight: impressions });
    }
  }

  for (const [date, r] of Object.entries(ratios)) {
    const day = byDate[date];
    if (!day) continue;
    day.impressionShare = weighted(r.is);
    day.budgetLostIs = weighted(r.budget);
    day.rankLostIs = weighted(r.rank);
    day.absoluteTopIs = weighted(r.top);
  }

  const totals = emptyDay();
  const allRows: RatioRows = [];
  const budgetRows: RatioRows = [];
  const rankRows: RatioRows = [];
  const topRows: RatioRows = [];
  for (const day of Object.values(byDate)) {
    totals.impressions += day.impressions;
    totals.clicks += day.clicks;
    totals.costMicros += day.costMicros;
    totals.conversions += day.conversions;
    totals.conversionsValue += day.conversionsValue;
    totals.allConversions += day.allConversions;
    if (day.impressionShare !== null)
      allRows.push({ value: day.impressionShare, weight: day.impressions });
    if (day.budgetLostIs !== null)
      budgetRows.push({ value: day.budgetLostIs, weight: day.impressions });
    if (day.rankLostIs !== null) rankRows.push({ value: day.rankLostIs, weight: day.impressions });
    if (day.absoluteTopIs !== null)
      topRows.push({ value: day.absoluteTopIs, weight: day.impressions });
  }
  totals.impressionShare = weighted(allRows);
  totals.budgetLostIs = weighted(budgetRows);
  totals.rankLostIs = weighted(rankRows);
  totals.absoluteTopIs = weighted(topRows);

  return { byDate, totals, enriched };
}

/** Cost per conversion in currency units (the API reports micros). */
export function costPerConversion(t: AdsDayTotals): number | null {
  if (t.conversions <= 0) return null;
  return t.costMicros / 1_000_000 / t.conversions;
}

export function ctrOf(t: AdsDayTotals): number {
  return t.impressions > 0 ? t.clicks / t.impressions : 0;
}

export function averageCpcOf(t: AdsDayTotals): number {
  return t.clicks > 0 ? t.costMicros / 1_000_000 / t.clicks : 0;
}

export function roasOf(t: AdsDayTotals): number | null {
  const spend = t.costMicros / 1_000_000;
  if (spend <= 0) return null;
  return t.conversionsValue / spend;
}

// The accounts the dashboard and both digests report on.
//
// Deliberately a constant, not env-driven: the Shopping account (480-889-6252)
// is parked — no enabled campaigns, no spend — and a permanent €0 line in every
// digest only teaches you to skim past the digest. Add it back here when it
// starts running again.
export const ADS_ACCOUNTS = ["668-709-2345"];

export const ADS_ACCOUNT_LABELS: Record<string, string> = {
  "480-889-6252": "Google Shopping",
  "668-709-2345": "Repair",
};

export function accountLabel(id: string): string {
  return ADS_ACCOUNT_LABELS[id] || id;
}
