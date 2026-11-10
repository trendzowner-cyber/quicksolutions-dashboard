// ─── Locations overview — per-campaign geo targeting, read-only ───
// Mirrors Bavian's Locations page: where each campaign shows ads.

import { queryGoogleAds } from "@/lib/google-ads";

export interface LocationTarget {
  geoTargetConstant: string; // resource name
  name: string;              // resolved below
  bidModifier: number | null;
  status: string;
}

export interface CampaignLocations {
  campaignId: string;
  campaignName: string;
  channelType: string;
  targets: LocationTarget[];
}

export async function fetchCampaignLocations(
  accessToken: string,
  customerId: string
): Promise<CampaignLocations[]> {
  const res = await queryGoogleAds(customerId, `
    SELECT
      campaign.id, campaign.name, campaign.advertising_channel_type,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.bid_modifier,
      campaign_criterion.status
    FROM campaign_criterion
    WHERE campaign.status = 'ENABLED'
      AND campaign_criterion.status != 'REMOVED'
      AND campaign_criterion.type = 'LOCATION'
    ORDER BY campaign.name ASC
    LIMIT 2000
  `, accessToken);

  const byCampaign = new Map<string, CampaignLocations>();
  const geoRns = new Set<string>();

  for (const r of (res.results ?? []) as Record<string, Record<string, unknown>>[]) {
    const c = r.campaign ?? {};
    const cc = r.campaignCriterion ?? r.campaign_criterion ?? {};
    const loc = (cc.location ?? {}) as Record<string, unknown>;
    const geoRn = String(loc.geoTargetConstant ?? loc.geo_target_constant ?? "");
    if (!geoRn) continue;
    geoRns.add(geoRn);

    const id = String(c.id ?? "");
    const entry = byCampaign.get(id) ?? {
      campaignId: id,
      campaignName: String(c.name ?? ""),
      channelType: String(c.advertisingChannelType ?? c.advertising_channel_type ?? ""),
      targets: [],
    };
    entry.targets.push({
      geoTargetConstant: geoRn,
      name: geoRn.split("/").pop() ?? geoRn, // placeholder until resolved
      bidModifier: cc.bidModifier != null ? Number(cc.bidModifier ?? cc.bid_modifier) : null,
      status: String(cc.status ?? ""),
    });
    byCampaign.set(id, entry);
  }

  // Resolve geo target names. geo_target_constant only supports filtering by
  // numeric id (verified live: resource_name filters are rejected), so chunk
  // the ids into IN lists.
  if (geoRns.size) {
    const ids = [...geoRns].map((rn) => rn.split("/").pop() ?? "").filter(Boolean);
    const names = new Map<string, string>();
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const gr = await queryGoogleAds(customerId, `
          SELECT geo_target_constant.id, geo_target_constant.resource_name,
                 geo_target_constant.name, geo_target_constant.canonical_name,
                 geo_target_constant.country_code, geo_target_constant.target_type
          FROM geo_target_constant
          WHERE geo_target_constant.id IN (${chunk.join(",")})
          LIMIT ${chunk.length}
        `, accessToken);
        for (const r of (gr.results ?? []) as Record<string, Record<string, unknown>>[]) {
          const g = r.geoTargetConstant ?? r.geo_target_constant ?? {};
          names.set(
            String(g.resourceName ?? g.resource_name ?? ""),
            String(g.canonicalName ?? g.canonical_name ?? g.name ?? "")
          );
        }
      }
      for (const camp of byCampaign.values()) {
        for (const t of camp.targets) {
          t.name = names.get(t.geoTargetConstant) ?? t.name;
        }
      }
    } catch { /* IDs remain as fallback */ }
  }

  return [...byCampaign.values()];
}
