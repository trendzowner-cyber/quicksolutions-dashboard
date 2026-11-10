// ─── Campaign assets (sitelinks, callouts, structured snippets) ───
// Mirrors Bavian's Assets page: read the live set per campaign, edit, save
// back to Google Ads. Writes go through the shared mutate() helper and the
// session-gated API route; each save lands in AuditLog via the route.

import { queryGoogleAds } from "@/lib/google-ads";
import { mutate } from "@/lib/ads-autopilot";

export interface Sitelink {
  campaignAssetRn: string;
  linkText: string;
  description1: string;
  description2: string;
  finalUrl: string;
}

export interface Callout {
  campaignAssetRn: string;
  text: string;
}

export interface CampaignAssets {
  campaignId: string;
  campaignName: string;
  sitelinks: Sitelink[];
  callouts: Callout[];
}

export async function fetchCampaignAssets(
  accessToken: string,
  customerId: string
): Promise<CampaignAssets[]> {
  const res = await queryGoogleAds(customerId, `
    SELECT
      campaign.id, campaign.name,
      campaign_asset.resource_name, campaign_asset.status,
      asset.type,
      asset.sitelink_asset.link_text,
      asset.sitelink_asset.description1,
      asset.sitelink_asset.description2,
      asset.final_urls,
      asset.callout_asset.callout_text
    FROM campaign_asset
    WHERE campaign.status = 'ENABLED'
      AND campaign_asset.status != 'REMOVED'
      AND asset.type IN ('SITELINK', 'CALLOUT')
    ORDER BY campaign.name ASC
    LIMIT 2000
  `, accessToken);

  const byCampaign = new Map<string, CampaignAssets>();
  for (const r of (res.results ?? []) as Record<string, Record<string, unknown>>[]) {
    const c = r.campaign ?? {};
    const ca = r.campaignAsset ?? r.campaign_asset ?? {};
    const a = r.asset ?? {};
    const type = String(a.type ?? "");
    const id = String(c.id ?? "");
    const entry = byCampaign.get(id) ?? {
      campaignId: id,
      campaignName: String(c.name ?? ""),
      sitelinks: [],
      callouts: [],
    };
    const rn = String(ca.resourceName ?? ca.resource_name ?? "");

    if (type === "SITELINK") {
      const sl = (a.sitelinkAsset ?? a.sitelink_asset ?? {}) as Record<string, unknown>;
      const urls = (a.finalUrls ?? a.final_urls ?? []) as string[];
      entry.sitelinks.push({
        campaignAssetRn: rn,
        linkText: String(sl.linkText ?? sl.link_text ?? ""),
        description1: String(sl.description1 ?? ""),
        description2: String(sl.description2 ?? ""),
        finalUrl: urls[0] ?? "",
      });
    } else if (type === "CALLOUT") {
      const co = (a.calloutAsset ?? a.callout_asset ?? {}) as Record<string, unknown>;
      entry.callouts.push({
        campaignAssetRn: rn,
        text: String(co.calloutText ?? co.callout_text ?? ""),
      });
    }
    byCampaign.set(id, entry);
  }
  return [...byCampaign.values()];
}

// Create + link in one mutate via temp resource names.
export async function addSitelink(
  customerId: string,
  campaignId: string,
  s: { linkText: string; description1?: string; description2?: string; finalUrl: string }
): Promise<void> {
  const clean = customerId.replace(/-/g, "");
  const tempRn = `customers/${clean}/assets/-1`;
  await mutate(customerId, await getToken(), [
    {
      assetOperation: {
        create: {
          resourceName: tempRn,
          finalUrls: [s.finalUrl],
          sitelinkAsset: {
            linkText: s.linkText,
            ...(s.description1 ? { description1: s.description1 } : {}),
            ...(s.description2 ? { description2: s.description2 } : {}),
          },
        },
      },
    },
    {
      campaignAssetOperation: {
        create: {
          campaign: `customers/${clean}/campaigns/${campaignId}`,
          asset: tempRn,
        },
      },
    },
  ]);
}

export async function addCallout(customerId: string, campaignId: string, text: string): Promise<void> {
  const clean = customerId.replace(/-/g, "");
  const tempRn = `customers/${clean}/assets/-1`;
  await mutate(customerId, await getToken(), [
    { assetOperation: { create: { resourceName: tempRn, calloutAsset: { calloutText: text } } } },
    {
      campaignAssetOperation: {
        create: { campaign: `customers/${clean}/campaigns/${campaignId}`, asset: tempRn },
      },
    },
  ]);
}

export async function removeCampaignAsset(customerId: string, campaignAssetRn: string): Promise<void> {
  await mutate(customerId, await getToken(), [
    { campaignAssetOperation: { remove: campaignAssetRn } },
  ]);
}

// mutate() takes the token as an arg; this indirection keeps the call sites
// above one-liners and matches the ads-autopilot pattern.
import { getAdAccessToken } from "@/lib/google-ads";
async function getToken() {
  return getAdAccessToken();
}
