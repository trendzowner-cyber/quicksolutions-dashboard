// ═══════════════════════════════════════════════════════════════════════════
// API-based daily auction presence (verified 2026-11-05, probe A)
//
// segments.auction_insight_domain + segments.date FROM campaign IS readable
// with our developer token — what is gated is only metrics.auction_insight_*.
// So we get WHO was in our auctions per campaign per day, never their share
// numbers. Nothing here invents rival percentages.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";

const GOOGLE_ADS_API_V = "https://googleads.googleapis.com/v23";

/** Our own display domains — Google lists you in your own auction insights.
 *  Kept in storage (immutable raw) but excluded from the competitor summary. */
const OWN_DOMAINS = new Set(["quicksolutionspro.be", "quicksolutions.be"]);

export interface PresenceRow {
  campaignId: string;
  campaignName: string;
  domain: string;
  seenOn: string; // YYYY-MM-DD
}

/** Paginated :search — the shared queryGoogleAds helper reads one page only,
 *  and a 90-day presence pull crosses the page size easily. */
async function queryAllPages(
  customerId: string,
  query: string,
  accessToken: string
): Promise<Record<string, unknown>[]> {
  const cleanId = customerId.replace(/-/g, "");
  const cleanManager = (process.env.GOOGLE_ADS_MANAGER_ID || "307-370-2998").replace(/-/g, "");
  const out: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    const res = await fetch(`${GOOGLE_ADS_API_V}/customers/${cleanId}/googleAds:search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "developer-token": process.env.GOOGLE_ADS_DEV_TOKEN || "",
        "login-customer-id": cleanManager,
      },
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Ads API error: ${err}`);
    }
    const data = await res.json();
    out.push(...((data.results ?? []) as Record<string, unknown>[]));
    pageToken =
      typeof data.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : undefined;
  } while (pageToken);

  return out;
}

/** Read presence rows for a date window (inclusive, YYYY-MM-DD). No metrics
 *  are selected on purpose: domain + date + campaign only. */
export async function fetchAuctionPresenceDays(
  accessToken: string,
  customerId: string,
  start: string,
  end: string
): Promise<PresenceRow[]> {
  const results = await queryAllPages(customerId, `
    SELECT campaign.id, campaign.name,
           segments.auction_insight_domain, segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.advertising_channel_type = 'SEARCH'
  `, accessToken);

  const rows: PresenceRow[] = [];
  for (const r of results) {
    const seg = (r.segments ?? {}) as Record<string, unknown>;
    const c = (r.campaign ?? {}) as Record<string, unknown>;
    const domain = String(seg.auctionInsightDomain ?? "").trim().toLowerCase();
    const seenOn = String(seg.date ?? "");
    // Empty domain = the aggregated "you"/non-attributed row — not a competitor.
    if (!domain || !seenOn) continue;
    rows.push({
      campaignId: String(c.id ?? ""),
      campaignName: String(c.name ?? ""),
      domain,
      seenOn,
    });
  }
  return rows;
}

function dayOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function storePresence(rows: PresenceRow[]): Promise<number> {
  if (!rows.length) return 0;
  const res = await db.auctionPresence.createMany({
    data: rows.map((r) => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      domain: r.domain,
      seenOn: dayOnly(r.seenOn),
      apiVersion: "v23",
    })),
    skipDuplicates: true,
  });
  return res.count;
}

/**
 * Daily sync: refresh the trailing 7 completed days (Google revises auction
 * data with a delay), or backfill 90 days in 30-day chunks when the table is
 * still empty. Today is excluded — only completed days count as presence.
 */
export async function syncAuctionPresence(
  accessToken: string,
  customerId: string
): Promise<{ stored: number; mode: "backfill" | "refresh"; coverageFrom: string }> {
  const existing = await db.auctionPresence.count();
  const yesterday = new Date(Date.now() - 86400000);

  if (existing === 0) {
    let stored = 0;
    for (let chunk = 0; chunk < 3; chunk++) {
      const end = new Date(yesterday.getTime() - chunk * 30 * 86400000);
      const start = new Date(end.getTime() - 29 * 86400000);
      const rows = await fetchAuctionPresenceDays(accessToken, customerId, isoDay(start), isoDay(end));
      stored += await storePresence(rows);
    }
    return { stored, mode: "backfill", coverageFrom: isoDay(new Date(yesterday.getTime() - 89 * 86400000)) };
  }

  const start = new Date(yesterday.getTime() - 6 * 86400000);
  const rows = await fetchAuctionPresenceDays(accessToken, customerId, isoDay(start), isoDay(yesterday));
  const stored = await storePresence(rows);
  const earliest = await db.auctionPresence.findFirst({ orderBy: { seenOn: "asc" }, select: { seenOn: true } });
  return { stored, mode: "refresh", coverageFrom: earliest ? isoDay(earliest.seenOn) : isoDay(start) };
}

// ─── Summary + change cards ───

export type PresenceStatus = "new" | "expanding" | "steady" | "cooling";

export interface PresenceSummary {
  domain: string;
  firstSeen: string;
  lastSeen: string;
  /** Distinct days seen within the trailing 30-day window. */
  daysSeen30: number;
  /** Distinct campaign names it appeared against within the same window. */
  campaigns30: string[];
  /** Ordered presence dates inside the 30-day window (heatmap source). */
  presenceDates: string[];
  status: PresenceStatus;
  statusReason: string;
}

export interface PresenceCoverage {
  coverageFrom: string | null;
  lastSyncAt: string | null;
  totalRows: number;
  note: string;
}

/**
 * Status thresholds are OUR product choices (documented, not Bavian's):
 *   new       — first observed in the last 14 days (of available data)
 *   expanding — at least 3 more presence days in the last 14 days than the
 *               14 days before that
 *   cooling   — not observed for 14+ days (NOT "gone": no row is not proof
 *               of absence — Google caps and delays this report)
 *   steady    — everything else
 */
export async function getPresenceSummary(): Promise<{ summary: PresenceSummary[]; coverage: PresenceCoverage }> {
  const now = Date.now();
  const d30 = new Date(now - 30 * 86400000);
  const d14 = new Date(now - 14 * 86400000);
  const d28 = new Date(now - 28 * 86400000);

  const all = await db.auctionPresence.findMany({
    select: { domain: true, seenOn: true, campaignId: true, campaignName: true },
    orderBy: { seenOn: "asc" },
  });
  const lastSync = await db.auctionPresence.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });

  const byDomain = new Map<string, { dates: Set<string>; campaigns30: Map<string, string> }>();
  for (const r of all) {
    if (OWN_DOMAINS.has(r.domain)) continue;
    if (!byDomain.has(r.domain)) byDomain.set(r.domain, { dates: new Set(), campaigns30: new Map() });
    const e = byDomain.get(r.domain)!;
    e.dates.add(isoDay(r.seenOn));
    if (r.seenOn >= d30 && r.campaignName) e.campaigns30.set(r.campaignId, r.campaignName);
  }

  const summary: PresenceSummary[] = [];
  let earliest: string | null = null;
  for (const [domain, e] of byDomain) {
    const dates = [...e.dates].sort();
    const firstSeen = dates[0];
    const lastSeen = dates[dates.length - 1];
    if (!earliest || firstSeen < earliest) earliest = firstSeen;
    const days30 = dates.filter((d) => dayOnly(d) >= d30).length;
    const last14 = dates.filter((d) => dayOnly(d) >= d14).length;
    const prev14 = dates.filter((d) => dayOnly(d) >= d28 && dayOnly(d) < d14).length;

    let status: PresenceStatus = "steady";
    let statusReason = "Gelijke aanwezigheid in beide 14-daagse blokken";
    if (dayOnly(firstSeen) >= d14) {
      status = "new";
      statusReason = `Eerst gezien op ${firstSeen} (binnen onze data)`;
    } else if (dayOnly(lastSeen) < d14) {
      status = "cooling";
      statusReason = `Niet meer gezien sinds ${lastSeen} — afwezigheid in de rapportage is geen bewijs dat ze gestopt zijn`;
    } else if (last14 >= 3 && last14 - prev14 >= 3) {
      status = "expanding";
      statusReason = `${last14} van de laatste 14 dagen aanwezig vs ${prev14} in de 14 dagen ervoor`;
    }

    summary.push({
      domain,
      firstSeen,
      lastSeen,
      daysSeen30: days30,
      campaigns30: [...e.campaigns30.values()],
      presenceDates: dates.filter((d) => dayOnly(d) >= d30),
      status,
      statusReason,
    });
  }

  summary.sort((a, b) => b.daysSeen30 - a.daysSeen30);

  return {
    summary,
    coverage: {
      coverageFrom: earliest,
      lastSyncAt: lastSync ? lastSync.fetchedAt.toISOString() : null,
      totalRows: all.length,
      note: "Aanwezigheid uit de Google Ads API (v23, alleen domein + datum). Geen concurrentie-percentages: die metrics zijn allowlist-gated. Afwezigheid van een rij is geen bewijs dat een concurrent niet adverteert.",
    },
  };
}

export interface AuctionChange {
  kind: "new_competitor" | "cooling_competitor" | "share_trend";
  tone: "warning" | "good" | "info";
  title: string;
  detail: string;
}

/** Deterministic change cards. Facts only — co-occurrence is not causation,
 *  so nothing here claims a named competitor moved your numbers. */
export async function getAuctionChanges(
  accessToken: string,
  customerId: string
): Promise<AuctionChange[]> {
  const { summary } = await getPresenceSummary();
  const changes: AuctionChange[] = [];

  for (const s of summary.filter((x) => x.status === "new").slice(0, 5)) {
    changes.push({
      kind: "new_competitor",
      tone: "info",
      title: `Nieuwe concurrent in je veilingen: ${s.domain}`,
      detail: `Eerst gezien op ${s.firstSeen}, actief naast ${s.campaigns30.length} campagne(s). Eerste waarneming in onze data — niet per se hun eerste advertentie ooit.`,
    });
  }
  for (const s of summary.filter((x) => x.status === "cooling").slice(0, 5)) {
    changes.push({
      kind: "cooling_competitor",
      tone: "good",
      title: `${s.domain} lijkt af te bouwen`,
      detail: `Laatst gezien op ${s.lastSeen}. Dit is afwezigheid in de rapportage, geen bewijs dat ze gestopt zijn met adverteren.`,
    });
  }

  // Own-share trend: two complete 14-day windows, delta in percentage points.
  try {
    const { fetchImpressionShareSeries } = await import("@/lib/ads-inventory");
    const series = await fetchImpressionShareSeries(accessToken, customerId, "DURING LAST_30_DAYS");
    const usable = series.filter((p) => p.share !== null);
    if (usable.length >= 28) {
      const last14 = usable.slice(-14);
      const prev14 = usable.slice(-28, -14);
      const avg = (arr: typeof usable) => arr.reduce((s, p) => s + (p.share ?? 0), 0) / arr.length;
      const deltaPp = (avg(last14) - avg(prev14)) * 100;
      if (Math.abs(deltaPp) >= 2) {
        changes.unshift({
          kind: "share_trend",
          tone: deltaPp < 0 ? "warning" : "good",
          title: deltaPp < 0 ? "Je impression share daalt" : "Je impression share stijgt",
          detail: `Van ${(avg(prev14) * 100).toFixed(1)}% naar ${(avg(last14) * 100).toFixed(1)}% (${deltaPp > 0 ? "+" : ""}${deltaPp.toFixed(1)} procentpunt, laatste 14 vs vorige 14 dagen, Search).`,
        });
      }
    }
  } catch {
    // Share trend is enrichment — presence cards alone are already useful.
  }

  return changes;
}

// ─── Per-domain keyword drilldown (live, on click) ───
// Verified 2026-11-05: keyword_view + segments.auction_insight_domain works in
// SELECT; the segment is NOT filterable in WHERE (PROHIBITED_FIELD_IN_WHERE),
// so we read the window and filter in code. ~8k rows / 2 pages / ±2.5s for
// 30 days on this account.

export interface DrilldownKeyword {
  text: string;
  matchType: string;
  adGroup: string;
  campaign: string;
  daysSeen: number;
  firstSeen: string;
  lastSeen: string;
}

export interface DomainDrilldown {
  domain: string;
  windowStart: string;
  windowEnd: string;
  keywords: DrilldownKeyword[];
  /** Domains seen at keyword level but without keyword detail rows. */
  note: string;
}

export async function fetchDomainDrilldown(
  accessToken: string,
  customerId: string,
  domain: string,
  start: string,
  end: string
): Promise<DomainDrilldown> {
  const results = await queryAllPages(customerId, `
    SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
           ad_group.name, campaign.name,
           segments.auction_insight_domain, segments.date
    FROM keyword_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
      AND campaign.advertising_channel_type = 'SEARCH'
  `, accessToken);

  const target = domain.trim().toLowerCase();
  const byKeyword = new Map<string, DrilldownKeyword & { dates: Set<string> }>();

  for (const r of results) {
    const seg = (r.segments ?? {}) as Record<string, unknown>;
    if (String(seg.auctionInsightDomain ?? "").toLowerCase() !== target) continue;
    const date = String(seg.date ?? "");
    const crit = (r.adGroupCriterion ?? {}) as Record<string, unknown>;
    const kw = (crit.keyword ?? {}) as Record<string, unknown>;
    const text = String(kw.text ?? "");
    if (!text || !date) continue;
    const adGroup = String(((r.adGroup ?? {}) as Record<string, unknown>).name ?? "");
    const campaign = String(((r.campaign ?? {}) as Record<string, unknown>).name ?? "");
    const key = `${text}|${adGroup}|${campaign}`;

    if (!byKeyword.has(key)) {
      byKeyword.set(key, {
        text,
        matchType: String(kw.matchType ?? ""),
        adGroup,
        campaign,
        daysSeen: 0,
        firstSeen: date,
        lastSeen: date,
        dates: new Set(),
      });
    }
    const e = byKeyword.get(key)!;
    e.dates.add(date);
    if (date < e.firstSeen) e.firstSeen = date;
    if (date > e.lastSeen) e.lastSeen = date;
  }

  const keywords = [...byKeyword.values()]
    .map(({ dates, ...k }) => ({ ...k, daysSeen: dates.size }))
    .sort((a, b) => b.daysSeen - a.daysSeen);

  return {
    domain: target,
    windowStart: start,
    windowEnd: end,
    keywords,
    note: keywords.length
      ? ""
      : "Geen keyword-niveau detail voor dit domein in dit venster. Keyword-dekking is smaller dan campagne-dekking — afwezigheid hier is geen bewijs dat het domein niet meebiedt.",
  };
}
