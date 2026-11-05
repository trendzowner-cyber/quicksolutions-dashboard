// ─── Auction insights: competitor presence tracking ───
//
// Google gates auction-insight metrics behind a closed developer-token
// allowlist (METRIC_ACCESS_DENIED for normal tokens). So the tracker runs on
// CSV exports from the Google Ads UI: Insights & reports → Auction insights →
// download. Each upload is a dated snapshot; presence over time is what turns
// a static report into "who showed up, where, and how often".

import { db } from "@/lib/db";
import { queryGoogleAds } from "@/lib/google-ads";

export interface AuctionProbe {
  available: boolean;
  reason?: string;
}

/** One probe per session is enough — the answer only changes when Google
 *  allowlists the token, which is an event, not a trend. */
export async function probeAuctionApi(accessToken: string, customerId: string): Promise<AuctionProbe> {
  try {
    await queryGoogleAds(customerId, `
      SELECT campaign.id, segments.auction_insight_domain,
             metrics.auction_insight_search_impression_share
      FROM campaign
      WHERE segments.date DURING LAST_7_DAYS
      LIMIT 1
    `, accessToken);
    return { available: true };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("METRIC_ACCESS_DENIED")) {
      return { available: false, reason: "Google geeft dit token geen toegang tot auction insights (allowlist gesloten). Gebruik de CSV-import hieronder." };
    }
    return { available: false, reason: msg.slice(0, 200) };
  }
}

// ─── CSV import ───

export interface CsvImportResult {
  imported: number;
  domains: string[];
}

/**
 * Parses a Google Ads auction-insights CSV. The export's shape varies by UI
 * language and level (campaign/keyword), so we locate columns by header name
 * instead of position: anything containing "domain"/"domein" is the domain,
 * "campaign"/"campagne" the campaign. Rows without a domain (summary rows,
 * "You"/"U" rows) are skipped.
 */
export async function importAuctionCsv(csvText: string, pulledOn: Date): Promise<CsvImportResult> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { imported: 0, domains: [] };

  // Google's exports often start with a title line ("Auction insights ...")
  // before the real header — find the first line that mentions a domain column.
  const headerIdx = lines.findIndex((l) => /domain|domein/i.test(l));
  if (headerIdx === -1) return { imported: 0, domains: [] };

  const header = splitCsvLine(lines[headerIdx]).map((h) => h.toLowerCase().trim());
  const domainCol = header.findIndex((h) => h.includes("domain") || h.includes("domein"));
  const campaignCol = header.findIndex((h) => h.includes("campaign") || h.includes("campagne"));
  if (domainCol === -1) return { imported: 0, domains: [] };

  const day = new Date(Date.UTC(pulledOn.getUTCFullYear(), pulledOn.getUTCMonth(), pulledOn.getUTCDate()));
  const seen = new Set<string>();
  const domains: string[] = [];

  for (const line of lines.slice(headerIdx + 1)) {
    const cols = splitCsvLine(line);
    const domain = (cols[domainCol] ?? "").trim().toLowerCase();
    if (!domain || !domain.includes(".")) continue;
    const campaignId = campaignCol >= 0 ? (cols[campaignCol] ?? "").trim() || "account" : "account";
    const key = `${campaignId}:${domain}`;
    if (seen.has(key)) continue;
    seen.add(key);

    await db.auctionSnapshot.upsert({
      where: { pulledOn_campaignId_domain: { pulledOn: day, campaignId, domain } },
      create: { pulledOn: day, campaignId, domain, source: "csv" },
      update: {},
    });
    if (!domains.includes(domain)) domains.push(domain);
  }

  return { imported: seen.size, domains };
}

/** Handles quoted cells with embedded separators. */
function splitCsvLine(line: string): string[] {
  const sep = line.includes(";") && !line.includes(",") ? ";" : ",";
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// ─── Presence report ───

export interface CompetitorPresence {
  domain: string;
  firstSeen: string;
  lastSeen: string;
  daysPresent30: number;
  campaigns: number;
  status: "new" | "steady" | "expanding" | "gone";
}

export async function getCompetitorPresence(): Promise<CompetitorPresence[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

  const all = await db.auctionSnapshot.findMany({
    select: { domain: true, pulledOn: true, campaignId: true },
    orderBy: { pulledOn: "asc" },
  });

  const byDomain = new Map<string, { dates: Date[]; campaigns: Set<string> }>();
  for (const s of all) {
    if (!byDomain.has(s.domain)) byDomain.set(s.domain, { dates: [], campaigns: new Set() });
    const entry = byDomain.get(s.domain)!;
    entry.dates.push(s.pulledOn);
    entry.campaigns.add(s.campaignId);
  }

  const out: CompetitorPresence[] = [];
  for (const [domain, { dates, campaigns }] of byDomain) {
    const firstSeen = dates[0];
    const lastSeen = dates[dates.length - 1];
    const daysPresent30 = dates.filter((d) => d >= thirtyDaysAgo).length;
    const last7 = dates.filter((d) => d >= sevenDaysAgo).length;
    const prev7 = dates.filter((d) => d >= fourteenDaysAgo && d < sevenDaysAgo).length;

    let status: CompetitorPresence["status"] = "steady";
    if (firstSeen >= sevenDaysAgo) status = "new";
    else if (lastSeen < fourteenDaysAgo) status = "gone";
    else if (last7 > prev7 && last7 >= 3) status = "expanding";

    out.push({
      domain,
      firstSeen: firstSeen.toISOString().slice(0, 10),
      lastSeen: lastSeen.toISOString().slice(0, 10),
      daysPresent30,
      campaigns: campaigns.size,
      status,
    });
  }

  // Most present first — that's who you're actually fighting.
  return out.sort((a, b) => b.daysPresent30 - a.daysPresent30);
}
