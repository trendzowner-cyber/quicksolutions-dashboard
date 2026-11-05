// ─── Ad variants (RSA) + conversion tracking ───
// All queries verified against the live account on 2026-11-05 (API v23):
//   ✅ ad_group_ad with responsive_search_ad headlines/descriptions
//      (headlines carry assetPerformanceLabel + policySummaryInfo inline)
//   ✅ ad_group_ad_asset_view — per-asset impressions/clicks/cost/conversions
//   ✅ conversion_action inventory incl. tag_snippets when Google has them

import { queryGoogleAds, getAdAccessToken } from "@/lib/google-ads";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v23";

// ─── Types ───

export interface RsaText {
  text: string;
  /** GOOD / LEARNING / LOW / PENDING — Google's own per-asset label. */
  performanceLabel: string | null;
  /** APPROVED / UNDER_REVIEW / DISAPPROVED etc. */
  approvalStatus: string | null;
  /** Per-asset stats joined from ad_group_ad_asset_view (asset-level metrics
   *  are notoriously partial — null means Google didn't report, not zero). */
  impressions: number | null;
  clicks: number | null;
  costMicros: number | null;
  conversions: number | null;
}

export interface AdVariantRow {
  resourceName: string;
  adId: string;
  name: string;
  status: string;
  adType: string;
  campaignName: string;
  adGroupName: string;
  finalUrl: string | null;
  headlines: RsaText[];
  descriptions: RsaText[];
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

export interface ConversionActionRow {
  id: string;
  name: string;
  category: string;
  status: string;
  primaryForGoal: boolean;
  countingType: string;
  defaultValue: number | null;
  globalSiteTag: string | null;
  eventSnippet: string | null;
}

// ─── Ad variants ───

type RawRow = Record<string, unknown>;

function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function num(v: unknown): number {
  return Number(v) || 0;
}

export async function fetchAdVariants(
  accessToken: string,
  customerId: string,
  clause = "DURING LAST_30_DAYS"
): Promise<AdVariantRow[]> {
  const res = await queryGoogleAds(customerId, `
    SELECT ad_group_ad.resource_name, ad_group_ad.ad.id, ad_group_ad.ad.name,
           ad_group_ad.status, ad_group_ad.ad.type,
           ad_group.name, campaign.name,
           ad_group_ad.ad.responsive_search_ad.headlines,
           ad_group_ad.ad.responsive_search_ad.descriptions,
           ad_group_ad.ad.final_urls,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM ad_group_ad
    WHERE ad_group_ad.status != 'REMOVED'
      AND segments.date ${clause}
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
  `, accessToken);

  const ads: AdVariantRow[] = [];
  for (const r of (res.results ?? []) as RawRow[]) {
    const aga = rec(r.adGroupAd ?? r.ad_group_ad);
    const ad = rec(aga.ad);
    const rsa = rec(ad.responsiveSearchAd ?? ad.responsive_search_ad);
    const m = rec(r.metrics);
    const finalUrls = (ad.finalUrls ?? ad.final_urls ?? []) as unknown[];

    const mapTexts = (items: unknown): RsaText[] =>
      ((items ?? []) as Record<string, unknown>[]).map((h) => ({
        text: String(h.text ?? ""),
        performanceLabel: h.assetPerformanceLabel ? String(h.assetPerformanceLabel) : null,
        approvalStatus: rec(h.policySummaryInfo ?? h.policy_summary_info).approvalStatus
          ? String(rec(h.policySummaryInfo ?? h.policy_summary_info).approvalStatus)
          : null,
        impressions: null,
        clicks: null,
        costMicros: null,
        conversions: null,
      }));

    ads.push({
      resourceName: String(aga.resourceName ?? aga.resource_name ?? ""),
      adId: String(ad.id ?? ""),
      name: String(ad.name ?? "") || `Ad ${String(ad.id ?? "")}`,
      status: String(aga.status ?? ""),
      adType: String(ad.type ?? ""),
      campaignName: String(rec(r.campaign).name ?? ""),
      adGroupName: String(rec(r.adGroup ?? r.ad_group).name ?? ""),
      finalUrl: finalUrls.length ? String(finalUrls[0]) : null,
      headlines: mapTexts(rsa.headlines),
      descriptions: mapTexts(rsa.descriptions),
      impressions: num(m.impressions),
      clicks: num(m.clicks),
      costMicros: num(m.costMicros ?? m.cost_micros),
      conversions: num(m.conversions),
    });
  }
  return ads;
}

/**
 * Per-headline performance, joined onto ads by ad id + headline text.
 * ad_group_ad_asset_view only reports when the asset actually served in that
 * combination — missing rows stay null, never zero.
 */
export async function attachHeadlineMetrics(
  accessToken: string,
  customerId: string,
  ads: AdVariantRow[],
  clause = "DURING LAST_30_DAYS"
): Promise<void> {
  try {
    const res = await queryGoogleAds(customerId, `
      SELECT ad_group_ad_asset_view.resource_name, ad_group_ad_asset_view.field_type,
             asset.text_asset.text,
             metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
      FROM ad_group_ad_asset_view
      WHERE segments.date ${clause}
        AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION')
    `, accessToken);

    // resourceName: customers/X/adGroupAdAssetViews/{adGroupId}~{adId}~{assetId}~{FIELD}
    const statsByAdAndText = new Map<string, { impressions: number | null; clicks: number | null; costMicros: number | null; conversions: number | null }>();
    for (const r of (res.results ?? []) as RawRow[]) {
      const view = rec(r.adGroupAdAssetView ?? r.ad_group_ad_asset_view);
      const rn = String(view.resourceName ?? view.resource_name ?? "");
      const adId = rn.split("~")[1] ?? "";
      const text = String(rec(rec(r.asset).textAsset ?? rec(r.asset).text_asset).text ?? "");
      const fieldType = String(view.fieldType ?? view.field_type ?? "");
      if (!adId || !text) continue;
      const m = rec(r.metrics);
      statsByAdAndText.set(`${adId}|${fieldType}|${text}`, {
        impressions: numOrNull(m.impressions),
        clicks: numOrNull(m.clicks),
        costMicros: numOrNull(m.costMicros ?? m.cost_micros),
        conversions: numOrNull(m.conversions),
      });
    }

    for (const ad of ads) {
      for (const list of [ad.headlines, ad.descriptions] as const) {
        const fieldType = list === ad.headlines ? "HEADLINE" : "DESCRIPTION";
        for (const t of list) {
          const s = statsByAdAndText.get(`${ad.adId}|${fieldType}|${t.text}`);
          if (s) Object.assign(t, s);
        }
      }
    }
  } catch (err) {
    // Asset-level metrics are enrichment — ads without them are still useful.
    console.error("Per-asset metrics lezen mislukt:", err);
  }
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

export interface RsaTextInput {
  headlines: string[];
  descriptions: string[];
}

/** Google RSA limits — validated server-side before any mutate call. */
export function validateRsaTexts(input: RsaTextInput): string | null {
  const { headlines, descriptions } = input;
  if (headlines.length < 3 || headlines.length > 15) return "RSA vereist 3–15 headlines";
  if (descriptions.length < 2 || descriptions.length > 4) return "RSA vereist 2–4 descriptions";
  if (headlines.some((h) => !h.trim())) return "Lege headline is niet toegestaan";
  if (descriptions.some((d) => !d.trim())) return "Lege description is niet toegestaan";
  if (headlines.some((h) => [...h].length > 30)) return "Headlines mogen max 30 tekens zijn";
  if (descriptions.some((d) => [...d].length > 90)) return "Descriptions mogen max 90 tekens zijn";
  if (new Set(headlines.map((h) => h.trim().toLowerCase())).size !== headlines.length)
    return "Dubbele headlines zijn niet toegestaan";
  return null;
}

export async function updateRsaTexts(
  customerId: string,
  adResourceName: string,
  texts: RsaTextInput
): Promise<void> {
  const err = validateRsaTexts(texts);
  if (err) throw new Error(err);
  await mutate(customerId, await getAdAccessToken(), [
    {
      adGroupAdOperation: {
        update: {
          resourceName: adResourceName,
          ad: {
            responsiveSearchAd: {
              headlines: texts.headlines.map((text) => ({ text: text.trim() })),
              descriptions: texts.descriptions.map((text) => ({ text: text.trim() })),
            },
          },
        },
        updateMask: "ad.responsive_search_ad.headlines,ad.responsive_search_ad.descriptions",
      },
    },
  ]);
}

export async function setAdStatus(
  customerId: string,
  adResourceName: string,
  status: "ENABLED" | "PAUSED"
): Promise<void> {
  await mutate(customerId, await getAdAccessToken(), [
    {
      adGroupAdOperation: {
        update: { resourceName: adResourceName, status },
        updateMask: "status",
      },
    },
  ]);
}

// ─── Conversion tracking ───

export async function fetchConversionActions(
  accessToken: string,
  customerId: string
): Promise<ConversionActionRow[]> {
  const res = await queryGoogleAds(customerId, `
    SELECT conversion_action.id, conversion_action.name, conversion_action.category,
           conversion_action.status, conversion_action.primary_for_goal,
           conversion_action.counting_type, conversion_action.value_settings.default_value,
           conversion_action.tag_snippets
    FROM conversion_action
    WHERE conversion_action.status != 'HIDDEN'
    ORDER BY conversion_action.name
    LIMIT 100
  `, accessToken);

  const rows: ConversionActionRow[] = [];
  for (const r of (res.results ?? []) as RawRow[]) {
    const ca = rec(r.conversionAction ?? r.conversion_action);
    const snippets = (ca.tagSnippets ?? ca.tag_snippets ?? []) as Record<string, unknown>[];
    let globalSiteTag: string | null = null;
    let eventSnippet: string | null = null;
    for (const s of snippets) {
      const type = String(s.type ?? "");
      const payload = String(s.snippet ?? "");
      if (!globalSiteTag && (type === "WEBPAGE" || payload.includes("gtag"))) globalSiteTag = payload;
      if (type === "WEBPAGE_EVENT" || (payload && payload.includes("send_to"))) eventSnippet = payload;
    }
    rows.push({
      id: String(ca.id ?? ""),
      name: String(ca.name ?? ""),
      category: String(ca.category ?? ""),
      status: String(ca.status ?? ""),
      primaryForGoal: Boolean(ca.primaryForGoal ?? ca.primary_for_goal),
      countingType: String(ca.countingType ?? ca.counting_type ?? ""),
      defaultValue: numOrNull(rec(ca.valueSettings ?? ca.value_settings).defaultValue ?? rec(ca.valueSettings ?? ca.value_settings).default_value),
      globalSiteTag,
      eventSnippet,
    });
  }
  return rows;
}
