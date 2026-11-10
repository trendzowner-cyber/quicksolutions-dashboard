// ─── Campaign creation — proposal-mode, single atomic mutate ───
// A new Search campaign with budget, ad group, keywords and one RSA ad.
// Everything goes through the proposal approval flow — nothing goes live
// without a human click. Uses temp resource names so one mutate call creates
// the whole tree atomically.

import { mutate } from "@/lib/ads-autopilot";

export interface NewCampaignSpec {
  name: string;
  dailyBudgetMicros: number;
  keywords: { text: string; matchType: "EXACT" | "PHRASE" | "BROAD" }[];
  headlines: string[];    // 3-15, max 30 chars each
  descriptions: string[]; // 2-4, max 90 chars each
  finalUrl: string;
  geoTargetIds?: string[]; // geo_target_constant IDs (e.g. ["1001252"])
}

export function validateCampaignSpec(spec: unknown): NewCampaignSpec {
  const s = spec as Record<string, unknown>;
  const name = String(s.name ?? "").trim();
  if (!name || name.length > 128) throw new Error("Campagnenaam verplicht (max 128 tekens)");

  const dailyBudgetMicros = Math.round(Number(s.dailyBudgetMicros));
  if (!Number.isFinite(dailyBudgetMicros) || dailyBudgetMicros < 1_000_000 || dailyBudgetMicros > 500_000_000) {
    throw new Error("Dagbudget moet tussen €1 en €500 liggen");
  }

  const keywords = (Array.isArray(s.keywords) ? s.keywords : [])
    .map((k: unknown) => {
      const kw = k as Record<string, unknown>;
      const text = String(kw.text ?? "").trim().toLowerCase();
      const mt = String(kw.matchType ?? "PHRASE").toUpperCase();
      return { text, matchType: (["EXACT", "PHRASE", "BROAD"].includes(mt) ? mt : "PHRASE") as "EXACT" | "PHRASE" | "BROAD" };
    })
    .filter((k: { text: string }) => k.text.length > 0 && k.text.length <= 80)
    .slice(0, 50);
  if (!keywords.length) throw new Error("Minstens 1 keyword verplicht");

  const headlines = (Array.isArray(s.headlines) ? s.headlines : [])
    .map(String).map((h: string) => h.trim().slice(0, 30)).filter(Boolean).slice(0, 15);
  if (headlines.length < 3) throw new Error("Minstens 3 headlines (max 30 tekens elk)");

  const descriptions = (Array.isArray(s.descriptions) ? s.descriptions : [])
    .map(String).map((d: string) => d.trim().slice(0, 90)).filter(Boolean).slice(0, 4);
  if (descriptions.length < 2) throw new Error("Minstens 2 beschrijvingen (max 90 tekens elk)");

  const finalUrl = String(s.finalUrl ?? "").trim();
  if (!finalUrl.startsWith("https://")) throw new Error("Final URL moet met https:// beginnen");

  const geoTargetIds = (Array.isArray(s.geoTargetIds) ? s.geoTargetIds : [])
    .map(String).filter((id: string) => /^\d+$/.test(id)).slice(0, 20);

  return { name, dailyBudgetMicros, keywords, headlines, descriptions, finalUrl, geoTargetIds };
}

/** Create the full campaign tree in one atomic mutate. Temp IDs link the
 *  budget → campaign → ad group → keywords/ad in a single request. */
export async function createCampaign(
  customerId: string,
  accessToken: string,
  spec: NewCampaignSpec
): Promise<string> {
  const clean = customerId.replace(/-/g, "");

  const operations: Record<string, unknown>[] = [
    // 1. Budget
    {
      campaignBudgetOperation: {
        create: {
          resourceName: `customers/${clean}/campaignBudgets/-1`,
          amountMicros: String(spec.dailyBudgetMicros),
          deliveryMethod: "STANDARD",
        },
      },
    },
    // 2. Campaign (Search, manual CPC to start — safest default)
    {
      campaignOperation: {
        create: {
          resourceName: `customers/${clean}/campaigns/-2`,
          name: spec.name,
          advertisingChannelType: "SEARCH",
          status: "PAUSED", // starts paused — user enables in Google Ads
          campaignBudget: `customers/${clean}/campaignBudgets/-1`,
          manualCpc: {},
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
          },
        },
      },
    },
    // 3. Ad group
    {
      adGroupOperation: {
        create: {
          resourceName: `customers/${clean}/adGroups/-3`,
          campaign: `customers/${clean}/campaigns/-2`,
          name: `${spec.name} — adgroep 1`,
          status: "ENABLED",
        },
      },
    },
    // 4. Keywords
    ...spec.keywords.map((kw) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: `customers/${clean}/adGroups/-3`,
          status: "ENABLED",
          keyword: { text: kw.text, matchType: kw.matchType },
        },
      },
    })),
    // 5. RSA ad
    {
      adGroupAdOperation: {
        create: {
          adGroup: `customers/${clean}/adGroups/-3`,
          status: "ENABLED",
          ad: {
            responsiveSearchAd: {
              headlines: spec.headlines.map((text) => ({ text })),
              descriptions: spec.descriptions.map((text) => ({ text })),
            },
            finalUrls: [spec.finalUrl],
          },
        },
      },
    },
    // 6. Geo targeting (optional)
    ...(spec.geoTargetIds ?? []).map((geoId) => ({
      campaignCriterionOperation: {
        create: {
          campaign: `customers/${clean}/campaigns/-2`,
          location: { geoTargetConstant: `geoTargetConstants/${geoId}` },
        },
      },
    })),
  ];

  await mutate(customerId, accessToken, operations);
  return spec.name;
}
