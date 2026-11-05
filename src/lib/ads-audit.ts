// ─── Account audit engine ───
//
// Replicates what a Bavian-style account review does, as deterministic GAQL
// checks. Every check is isolated in try/catch: a rejected column or an
// unsupported campaign type degrades that one finding to "unavailable",
// never the whole audit. The AI layer (see the route) only *writes up* what
// these checks found — it never invents numbers.

import { queryGoogleAds } from "@/lib/google-ads";

export interface Finding {
  id: string;
  severity: "critical" | "warning" | "ok" | "unavailable";
  title: string;
  detail: string;
  /** Flat label→value map, rendered as small stats under the finding. */
  stats?: Record<string, string>;
}

type RawRow = Record<string, unknown>;

function num(v: unknown): number {
  return Number(v) || 0;
}
function eur(micros: number): string {
  return `€${(micros / 1_000_000).toLocaleString("nl-BE", { maximumFractionDigits: 2 })}`;
}
function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

async function tryQuery(accessToken: string, customerId: string, query: string) {
  const res = await queryGoogleAds(customerId, query, accessToken);
  return (res.results ?? []) as RawRow[];
}

const ok = (id: string, title: string, detail: string): Finding => ({ id, severity: "ok", title, detail });
const unavailable = (id: string, title: string): Finding => ({
  id, severity: "unavailable", title,
  detail: "Niet meetbaar via de API voor dit account — overgeslagen.",
});

// ─── 1. Conversion actions: silent, proxy-valued, primary chaos ───

async function checkConversionActions(accessToken: string, customerId: string): Promise<Finding> {
  const id = "conversion-actions";
  const title = "Conversie-acties";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT conversion_action.id, conversion_action.name, conversion_action.status,
             conversion_action.category, conversion_action.primary_for_goal,
             conversion_action.value_settings.default_value,
             metrics.conversions
      FROM conversion_action
      WHERE segments.date DURING LAST_30_DAYS
    `);
    if (!rows.length) return unavailable(id, title);

    const enabled = rows.filter((r) => {
      const ca = r.conversionAction ?? r.conversion_action ?? {};
      return (ca as Record<string, unknown>).status === "ENABLED";
    });
    const silent = enabled.filter((r) => num((r.metrics as Record<string, unknown>)?.conversions) === 0);
    const primary = enabled.filter((r) => {
      const ca = (r.conversionAction ?? r.conversion_action ?? {}) as Record<string, unknown>;
      return ca.primaryForGoal === true || ca.primary_for_goal === true;
    });
    // Proxy values: a configured default value on a non-purchase action means
    // "conversion value" in reports is configured, not revenue.
    const proxyValued = enabled.filter((r) => {
      const ca = (r.conversionAction ?? r.conversion_action ?? {}) as Record<string, unknown>;
      const vs = (ca.valueSettings ?? ca.value_settings ?? {}) as Record<string, unknown>;
      return num(vs.defaultValue ?? vs.default_value) > 0 && ca.category !== "PURCHASE";
    });

    const stats = {
      "Actief": String(enabled.length),
      "Primair": String(primary.length),
      "Stil (0 conv. / 30d)": String(silent.length),
      "Met aangenomen waarde": String(proxyValued.length),
    };

    if (silent.length > enabled.length / 2 || proxyValued.length > 0) {
      return {
        id, severity: "critical", title, stats,
        detail: `${silent.length} van ${enabled.length} actieve conversie-acties registreerden niets in 30 dagen. ${proxyValued.length} acties gebruiken een ingestelde (geen echte) waarde — de "conversiewaarde" in rapporten is dus deels een aanname, geen omzet.`,
      };
    }
    return ok(id, title, `${enabled.length} actieve acties, waarvan ${silent.length} stil. Meetbaarheid ziet er redelijk uit.`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 2. Policy-restricted ads ───

async function checkPolicyRestrictions(accessToken: string, customerId: string): Promise<Finding> {
  const id = "policy";
  const title = "Advertentie-goedkeuring (policy)";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT ad_group_ad.ad.id, ad_group.name, campaign.name,
             ad_group_ad.policy_summary.approval_status,
             metrics.cost_micros, metrics.impressions
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
        AND campaign.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
    `);
    if (!rows.length) return unavailable(id, title);

    const restricted = rows.filter((r) => {
      const ps = ((r.adGroupAd ?? r.ad_group_ad ?? {}) as Record<string, unknown>).policySummary
        ?? ((r.adGroupAd ?? r.ad_group_ad ?? {}) as Record<string, unknown>).policy_summary ?? {};
      const status = String((ps as Record<string, unknown>).approvalStatus ?? (ps as Record<string, unknown>).approval_status ?? "");
      return status !== "APPROVED" && status !== "";
    });
    const restrictedCost = restrictedCostMicros(restricted);
    const total = rows.length;

    const stats = {
      "Advertenties getoetst": String(total),
      "Beperkt/afgekeurd": String(restricted.length),
      "Spend via beperkte ads": eur(restrictedCost),
    };

    if (restricted.length > 0) {
      return {
        id, severity: restricted.length > total / 3 ? "critical" : "warning", title, stats,
        detail: `${restricted.length} van ${total} actieve advertenties zijn niet volledig goedgekeurd en deden mee voor ${eur(restrictedCost)}. Elke beperkte advertentie levert minder vaak — los de policy-reden op, niet alleen de tekst.`,
      };
    }
    return ok(id, title, `Alle ${total} actieve advertenties zijn volledig goedgekeurd.`);
  } catch {
    return unavailable(id, title);
  }
}
function restrictedCostMicros(rows: RawRow[]): number {
  return rows.reduce((s, r) => s + num((r.metrics as Record<string, unknown>)?.costMicros ?? (r.metrics as Record<string, unknown>)?.cost_micros), 0);
}

// ─── 3. Silent ad groups ───

async function checkSilentAdGroups(accessToken: string, customerId: string): Promise<Finding> {
  const id = "silent-adgroups";
  const title = "Stille advertentiegroepen";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT ad_group.id, ad_group.name, campaign.name, metrics.impressions
      FROM ad_group
      WHERE ad_group.status = 'ENABLED'
        AND campaign.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
    `);
    if (!rows.length) return unavailable(id, title);

    const silent = rows.filter((r) => num((r.metrics as Record<string, unknown>)?.impressions) === 0);
    const stats = { "Actieve groepen": String(rows.length), "Zonder vertoningen": String(silent.length) };

    if (silent.length > rows.length / 4) {
      const names = silent.slice(0, 5).map((r) => String((r.adGroup ?? r.ad_group ?? {})['name' as keyof object] ?? "")).filter(Boolean);
      return {
        id, severity: "warning", title, stats,
        detail: `${silent.length} van ${rows.length} actieve advertentiegroepen kregen 0 vertoningen — schijnbare dekking is geen echte dekking. O.a.: ${names.join(", ")}${silent.length > 5 ? "…" : ""}`,
      };
    }
    return ok(id, title, `${rows.length - silent.length} van ${rows.length} groepen leveren effectief vertoningen.`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 4. Bidding configuration ───

async function checkBidding(accessToken: string, customerId: string): Promise<Finding> {
  const id = "bidding";
  const title = "Biedstrategieën";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT campaign.name, campaign.bidding_strategy_type,
             campaign.target_impression_share.location,
             campaign.target_impression_share.location_fraction_micros,
             campaign.target_impression_share.cpc_bid_ceiling_micros,
             campaign.maximize_conversions.target_cpa_micros,
             campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.status = 'ENABLED'
    `);
    if (!rows.length) return unavailable(id, title);

    const problems: string[] = [];
    for (const r of rows) {
      const c = (r.campaign ?? {}) as Record<string, unknown>;
      const name = String(c.name ?? "");
      const type = String(c.biddingStrategyType ?? c.bidding_strategy_type ?? "");
      const tis = (c.targetImpressionShare ?? c.target_impression_share ?? {}) as Record<string, unknown>;
      const mc = (c.maximizeConversions ?? c.maximize_conversions ?? {}) as Record<string, unknown>;
      const channel = String(c.advertisingChannelType ?? c.advertising_channel_type ?? "");

      if (type === "TARGET_IMPRESSION_SHARE") {
        const ceiling = num(tis.cpcBidCeilingMicros ?? tis.cpc_bid_ceiling_micros);
        problems.push(`${name}: Target Impression Share koopt zichtbaarheid, geen klanten (CPC-plafond ${eur(ceiling)})`);
      }
      if (type === "MAXIMIZE_CONVERSIONS" && num(mc.targetCpaMicros ?? mc.target_cpa_micros) === 0) {
        problems.push(`${name}: Maximize Conversions zonder CPA-doel — onbegrensde klikprijzen (${channel})`);
      }
    }

    const stats = { "Campagnes getoetst": String(rows.length), "Risicovolle strategieën": String(problems.length) };
    if (problems.length) {
      return {
        id, severity: "warning", title, stats,
        detail: problems.slice(0, 4).join(". ") + (problems.length > 4 ? ` …(+${problems.length - 4})` : ""),
      };
    }
    return ok(id, title, `${rows.length} campagnes gebruiken doelgerichte strategieën.`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 5. Shared negative lists blocking real services ───

// Service vocabulary of a repair business. A broad negative containing one of
// these almost certainly kills real buying intent along with the junk.
const SERVICE_TERMS = [
  "reparatie", "repareren", "herstellen", "herstel", "vervangen", "scherm",
  "accu", "batterij", "macbook", "iphone", "samsung", "pixel", "laptop",
  "refurbished", "tweedehands", "kopen", "switch", "playstation", "connector",
];

async function checkSharedNegatives(accessToken: string, customerId: string): Promise<Finding> {
  const id = "shared-negatives";
  const title = "Gedeelde negatieve lijsten";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type,
             shared_set.name
      FROM shared_criterion
      WHERE shared_set.status = 'ENABLED'
        AND shared_criterion.type = 'KEYWORD'
      LIMIT 1000
    `);
    if (!rows.length) return ok(id, title, "Geen actieve gedeelde negatieve lijsten gevonden.");

    const conflicts: string[] = [];
    for (const r of rows) {
      const sc = (r.sharedCriterion ?? r.shared_criterion ?? {}) as Record<string, unknown>;
      const kw = (sc.keyword ?? {}) as Record<string, unknown>;
      const text = String(kw.text ?? "").toLowerCase();
      const match = String(kw.matchType ?? kw.match_type ?? "");
      if (!text) continue;
      // Broad/phrase negatives that contain a service word are the dangerous
      // ones; an exact negative for a service term is a deliberate choice.
      if (match !== "EXACT" && SERVICE_TERMS.some((t) => text.includes(t))) {
        const listName = String(((r.sharedSet ?? r.shared_set ?? {}) as Record<string, unknown>).name ?? "");
        conflicts.push(`"${text}" (${match}) in lijst "${listName}"`);
      }
    }

    const stats = { "Negatieven getoetst": String(rows.length), "Conflictgevallen": String(conflicts.length) };
    if (conflicts.length) {
      return {
        id, severity: "critical", title, stats,
        detail: `${conflicts.length} brede negatieven blokkeren mogelijk echte reparatie-zoekintentie: ${conflicts.slice(0, 6).join("; ")}${conflicts.length > 6 ? ` …(+${conflicts.length - 6})` : ""}`,
      };
    }
    return ok(id, title, `${rows.length} gedeelde negatieven getoetst, geen conflicten met diensten.`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 6. Landing page concentration ───

async function checkLandingPages(accessToken: string, customerId: string): Promise<Finding> {
  const id = "landing-pages";
  const title = "Landingspagina-spreiding";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT landing_page_view.unexpanded_final_url, metrics.cost_micros, metrics.clicks
      FROM landing_page_view
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY metrics.cost_micros DESC
      LIMIT 25
    `);
    if (!rows.length) return unavailable(id, title);

    const total = rows.reduce((s, r) => s + num((r.metrics as Record<string, unknown>)?.costMicros ?? (r.metrics as Record<string, unknown>)?.cost_micros), 0);
    const top = rows[0];
    const topUrl = String((((top.landingPageView ?? top.landing_page_view ?? {}) as Record<string, unknown>).unexpandedFinalUrl
      ?? ((top.landingPageView ?? top.landing_page_view ?? {}) as Record<string, unknown>).unexpanded_final_url) ?? "");
    const topCost = num((top.metrics as Record<string, unknown>)?.costMicros ?? (top.metrics as Record<string, unknown>)?.cost_micros);
    const share = total > 0 ? topCost / total : 0;
    const path = topUrl.replace(/^https?:\/\/[^/]+/, "") || "/";

    const stats = { "Pagina's met spend": String(rows.length), "Grootste pagina": `${path} (${pct(share)})` };
    if (share > 0.5) {
      return {
        id, severity: "warning", title, stats,
        detail: `${pct(share)} van de spend landt op één generieke pagina (${path}). Reparatie-specifieke zoekopdrachten converteren beter op een matchende dienstpagina.`,
      };
    }
    return ok(id, title, `Spend is gespreid over ${rows.length} pagina's; grootste pagina heeft ${pct(share)}.`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 7. Geo leak (spend outside Belgium) ───

async function checkGeoLeak(accessToken: string, customerId: string): Promise<Finding> {
  const id = "geo-leak";
  const title = "Geografische lekkage";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT geographic_view.country_criterion_id, metrics.cost_micros
      FROM geographic_view
      WHERE segments.date DURING LAST_30_DAYS
    `);
    if (!rows.length) return unavailable(id, title);

    // Belgium's geo_target_constant id is 2056 — stable across the API.
    const belgiumId = "2056";
    const total = rows.reduce((s, r) => s + num((r.metrics as Record<string, unknown>)?.costMicros ?? (r.metrics as Record<string, unknown>)?.cost_micros), 0);
    const foreign = rows
      .filter((r) => {
        const gv = (r.geographicView ?? r.geographic_view ?? {}) as Record<string, unknown>;
        return String(gv.countryCriterionId ?? gv.country_criterion_id ?? "") !== belgiumId;
      })
      .reduce((s, r) => s + num((r.metrics as Record<string, unknown>)?.costMicros ?? (r.metrics as Record<string, unknown>)?.cost_micros), 0);

    const share = total > 0 ? foreign / total : 0;
    const stats = { "Totale spend": eur(total), "Buiten België": `${eur(foreign)} (${pct(share)})` };

    if (foreign > 5_000_000) {
      return {
        id, severity: share > 0.05 ? "critical" : "warning", title, stats,
        detail: `${eur(foreign)} (${pct(share)}) van de spend komt van buiten België. Voor een lokale reparatiewinkel is dat vrijwel altijd verspilling — check de targeting-instelling "presence or interest".`,
      };
    }
    return ok(id, title, `Vrijwel alle spend (${pct(1 - share)}) blijft binnen België.`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 8. Quality Score drag ───

async function checkQualityScore(accessToken: string, customerId: string): Promise<Finding> {
  const id = "quality-score";
  const title = "Quality Score";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT ad_group_criterion.quality_info.quality_score,
             ad_group_criterion.keyword.text,
             metrics.cost_micros
      FROM keyword_view
      WHERE campaign.status = 'ENABLED'
        AND ad_group_criterion.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
        AND metrics.impressions > 0
    `);
    if (!rows.length) return unavailable(id, title);

    let total = 0;
    let low = 0;
    const worst: { text: string; qs: number; cost: number }[] = [];
    for (const r of rows) {
      const crit = (r.adGroupCriterion ?? r.ad_group_criterion ?? {}) as Record<string, unknown>;
      const qi = (crit.qualityInfo ?? crit.quality_info ?? {}) as Record<string, unknown>;
      const qs = num(qi.qualityScore ?? qi.quality_score);
      const cost = num((r.metrics as Record<string, unknown>)?.costMicros ?? (r.metrics as Record<string, unknown>)?.cost_micros);
      total += cost;
      if (qs > 0 && qs <= 3) {
        low += cost;
        worst.push({ text: String(((crit.keyword ?? {}) as Record<string, unknown>).text ?? ""), qs, cost });
      }
    }

    const share = total > 0 ? low / total : 0;
    worst.sort((a, b) => b.cost - a.cost);
    const stats = { "Spend op QS ≤ 3": `${eur(low)} (${pct(share)})` };

    if (share > 0.15) {
      return {
        id, severity: share > 0.4 ? "critical" : "warning", title, stats,
        detail: `${pct(share)} van de keyword-spend zit op Quality Score ≤ 3 — je overbetaalt per klik. Ergste: ${worst.slice(0, 3).map((w) => `"${w.text}" (QS ${w.qs}, ${eur(w.cost)})`).join(", ")}.`,
      };
    }
    return ok(id, title, `Slechts ${pct(share)} van de spend zit op lage Quality Scores.`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 9. Brand spend inside Performance Max ───

async function checkBrandInPmax(accessToken: string, customerId: string): Promise<Finding> {
  const id = "brand-in-pmax";
  const title = "Merkzoektermen in Performance Max";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks
      FROM search_term_view
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
        AND segments.date DURING LAST_30_DAYS
    `);
    if (!rows.length) return ok(id, title, "Geen PMax-zoektermen-data in deze periode.");

    const brand = rows.filter((r) => {
      const st = (r.searchTermView ?? r.search_term_view ?? {}) as Record<string, unknown>;
      return String(st.searchTerm ?? st.search_term ?? "").toLowerCase().includes("quicksolutions");
    });
    const cost = brand.reduce((s, r) => s + num((r.metrics as Record<string, unknown>)?.costMicros ?? (r.metrics as Record<string, unknown>)?.cost_micros), 0);
    const clicks = brand.reduce((s, r) => s + num((r.metrics as Record<string, unknown>)?.clicks), 0);
    const stats = { "Merk-termen in PMax": String(brand.length), "Kosten": `${eur(cost)} / ${clicks} kliks` };

    if (cost > 20_000_000) {
      return {
        id, severity: "warning", title, stats,
        detail: `PMax kocht ${eur(cost)} aan zoekopdrachten op je eigen naam. Die bezoekers zochten je al — dat is navigatie, geen acquisitie, en het vertroebelt je PMax-cijfers. Overweeg brand exclusions.`,
      };
    }
    return ok(id, title, `PMax-spend op eigen merknaam blijft beperkt (${eur(cost)}).`);
  } catch {
    return unavailable(id, title);
  }
}

// ─── 10. Device split ───

async function checkDeviceSplit(accessToken: string, customerId: string): Promise<Finding> {
  const id = "device-split";
  const title = "Toestelverdeling";
  try {
    const rows = await tryQuery(accessToken, customerId, `
      SELECT segments.device, metrics.cost_micros, metrics.conversions
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
    `);
    if (!rows.length) return unavailable(id, title);

    const byDevice: Record<string, { cost: number; conv: number }> = {};
    for (const r of rows) {
      const d = String(((r.segments ?? {}) as Record<string, unknown>).device ?? "UNKNOWN");
      byDevice[d] ??= { cost: 0, conv: 0 };
      byDevice[d].cost += num((r.metrics as Record<string, unknown>)?.costMicros ?? (r.metrics as Record<string, unknown>)?.cost_micros);
      byDevice[d].conv += num((r.metrics as Record<string, unknown>)?.conversions);
    }
    const total = Object.values(byDevice).reduce((s, d) => s + d.cost, 0);
    const stats: Record<string, string> = {};
    for (const [d, v] of Object.entries(byDevice)) {
      stats[d] = `${eur(v.cost)} (${total > 0 ? pct(v.cost / total) : "—"}) · ${v.conv} conv.`;
    }
    const mobile = byDevice["MOBILE"]?.cost ?? 0;
    const detail = total > 0 && mobile / total > 0.6
      ? "Mobiel domineert de spend — test je landingspagina's en klikbare belknop dus vooral op een telefoon."
      : "De spend is redelijk verdeeld over toestellen.";
    return { id, severity: "ok", title, detail, stats };
  } catch {
    return unavailable(id, title);
  }
}

// ─── Orchestrator ───

export async function runAudit(accessToken: string, customerId: string): Promise<Finding[]> {
  // Sequential on purpose: ten simultaneous GAQL calls against one standard-
  // access token is how you get rate-limited, and an audit is a 30-second
  // wait, not a dashboard poll.
  const checks = [
    checkConversionActions,
    checkPolicyRestrictions,
    checkSilentAdGroups,
    checkBidding,
    checkSharedNegatives,
    checkLandingPages,
    checkGeoLeak,
    checkQualityScore,
    checkBrandInPmax,
    checkDeviceSplit,
  ];
  const findings: Finding[] = [];
  for (const check of checks) {
    findings.push(await check(accessToken, customerId));
  }
  return findings;
}
