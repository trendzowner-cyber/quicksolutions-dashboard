// ─── Competitor ad tracker — Google Ads Transparency Center ───
//
// The Transparency Center (adstransparency.google.com) is public EU ad data:
// every creative an advertiser runs, with format, first/last shown dates and
// a rendered preview image. No API key, no OAuth — Google's own site reads it
// through an internal RPC, and so do we. This is the same data source Bavian
// uses for its "Competitors" feature; we add the thing theirs is missing:
// working previews (every creative carries a tpc.googlesyndication.com
// render URL — even text ads, where headline+copy are baked into the image).
//
// Rate limits: Google answers with an HTML page (not JSON) when it throttles.
// We pace calls at ~1/s and back off on anything that isn't JSON.

import { db } from "@/lib/db";

const RPC_SEARCH =
  "https://adstransparency.google.com/anji/_/rpc/SearchService/SearchCreatives";
const RPC_SUGGEST =
  "https://adstransparency.google.com/anji/_/rpc/SearchService/SearchSuggestions";

// Geo target constant for Belgium — the same id the Google Ads API uses for
// location targeting, and what the Transparency RPC expects in field 3.8.
const REGION_BELGIUM = 2056;

const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Cookie: "CONSENT=YES+cb",
};

const PACE_MS = 1100;
let lastCallAt = 0;

export interface TransparencyAd {
  creativeId: string;
  advertiserId: string;
  advertiser: string;
  format: "text" | "image" | "video" | "unknown";
  firstShown: string | null; // YYYY-MM-DD
  lastShown: string | null;
  domain: string;
  previewUrl: string | null;
  link: string;
}

export interface AdvertiserSuggestion {
  advertiserId: string;
  name: string;
}

const FORMATS: Record<number, TransparencyAd["format"]> = {
  1: "text",
  2: "image",
  3: "video",
};

const SIMGAD = /https:\/\/tpc\.googlesyndication\.com\/archive\/simgad\/\d+/;

function toDate(epoch: unknown): string | null {
  const n = Number(epoch);
  if (!n || !isFinite(n)) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
}

async function pace() {
  const wait = PACE_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

/** POST f.req with retry/backoff. Google returns HTML (200 or 429) when it
 *  rate-limits, so "is it JSON" is the health check, not the status code. */
async function rpcPost(url: string, body: Record<string, unknown>, tries = 4): Promise<Record<string, unknown>> {
  let delay = 5000;
  for (let attempt = 1; attempt <= tries; attempt++) {
    await pace();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: HEADERS,
        body: `f.req=${encodeURIComponent(JSON.stringify(body))}`,
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith("{")) {
        return JSON.parse(text) as Record<string, unknown>;
      }
      // HTML page or 429 — throttled. Wait it out.
    } catch {
      // network error — same backoff
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30000);
  }
  throw new Error(
    "Google Transparency Center beperkt tijdelijk verzoeken (rate limit). Probeer over een paar minuten opnieuw."
  );
}

/** Resolve an advertiser name to its Transparency Center advertiser id. */
export async function searchAdvertisers(name: string): Promise<AdvertiserSuggestion[]> {
  const res = await rpcPost(RPC_SUGGEST, { "1": name, "2": 10, "3": 10 });
  const out: AdvertiserSuggestion[] = [];
  const seen = new Set<string>();
  for (const s of (res["1"] ?? []) as Record<string, unknown>[]) {
    const inner = s?.["1"] as Record<string, unknown> | undefined;
    const id = inner?.["2"];
    if (inner && typeof id === "string" && id && !seen.has(id)) {
      seen.add(id);
      out.push({ advertiserId: id, name: String(inner["1"] ?? "") });
    }
  }
  return out;
}

function parseAd(a: Record<string, unknown>): TransparencyAd | null {
  const creativeId = a["2"];
  const advertiserId = a["1"];
  if (typeof creativeId !== "string" || typeof advertiserId !== "string") return null;

  const blob = JSON.stringify(a["3"] ?? {}).replace(/\\\//g, "/");
  const preview = SIMGAD.exec(blob)?.[0] ?? null;

  return {
    creativeId,
    advertiserId,
    advertiser: String(a["12"] ?? ""),
    format: FORMATS[Number(a["4"])] ?? "unknown",
    firstShown: toDate((a["6"] as Record<string, unknown> | undefined)?.["1"]),
    lastShown: toDate((a["7"] as Record<string, unknown> | undefined)?.["1"]),
    domain: String(a["14"] ?? ""),
    previewUrl: preview,
    link: `https://adstransparency.google.com/advertiser/${advertiserId}/creative/${creativeId}?region=BE`,
  };
}

interface SearchOptions {
  domain?: string;
  advertiserId?: string;
  /** Geo-filter on where the ads were shown. Defaults to Belgium. */
  region?: number | null;
  /** Pages of 100 to fetch (each page = 1 RPC call). Default 2. */
  maxPages?: number;
}

/**
 * Fetch creatives for a domain or advertiser. Returns newest-first, deduped.
 * The Transparency Center only indexes ads shown in the EU — for Belgian
 * advertisers on Belgian traffic that's exactly the set that matters.
 */
export async function searchCreatives(opts: SearchOptions): Promise<TransparencyAd[]> {
  const { domain, advertiserId, region = REGION_BELGIUM, maxPages = 2 } = opts;
  const ads: TransparencyAd[] = [];
  const seen = new Set<string>();
  let token = "";

  for (let page = 0; page < maxPages; page++) {
    const filter: Record<string, unknown> = {};
    if (region) filter["8"] = [region];
    if (domain) filter["12"] = { "1": domain };
    if (advertiserId) filter["13"] = { "1": [advertiserId] };

    const body: Record<string, unknown> = { "2": 100, "3": filter, "7": { "1": 1 } };
    if (token) body["4"] = token;

    const res = await rpcPost(RPC_SEARCH, body);
    const items = (res["1"] ?? []) as Record<string, unknown>[];
    for (const a of items) {
      const ad = parseAd(a);
      if (ad && !seen.has(ad.creativeId)) {
        seen.add(ad.creativeId);
        ads.push(ad);
      }
    }
    token = typeof res["2"] === "string" ? res["2"] : "";
    if (!items.length || !token) break;
  }

  return ads;
}

/** Normalize whatever the user pastes — "https://www.lab9.be/", "Lab9" — into
 *  a domain when it looks like one, else keep it as a name for suggestion
 *  search. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function looksLikeDomain(input: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(normalizeDomain(input));
}

/** Persist a fresh pull for one competitor. Returns the creatives that are
 *  new to us — used by both the add flow and the daily sync (which alerts on
 *  them via Telegram). */
export async function storeAds(
  competitorId: string,
  ads: TransparencyAd[]
): Promise<{ stored: number; fresh: TransparencyAd[] }> {
  const existing = await db.competitorAd.findMany({
    where: { competitorId },
    select: { creativeId: true },
  });
  const known = new Set(existing.map((a) => a.creativeId));
  const fresh = ads.filter((a) => !known.has(a.creativeId));

  if (ads.length) {
    await db.competitorAd.createMany({
      data: ads.map((a) => ({
        competitorId,
        creativeId: a.creativeId,
        advertiserId: a.advertiserId,
        advertiser: a.advertiser,
        format: a.format,
        previewUrl: a.previewUrl,
        link: a.link,
        firstShown: a.firstShown ? new Date(a.firstShown) : null,
        lastShown: a.lastShown ? new Date(a.lastShown) : null,
      })),
      skipDuplicates: true,
    });
    // Everything still visible in the pull is still alive — touch lastSeenAt.
    await db.competitorAd.updateMany({
      where: { competitorId, creativeId: { in: ads.map((a) => a.creativeId) } },
      data: { lastSeenAt: new Date() },
    });
  }

  await db.competitor.update({
    where: { id: competitorId },
    data: {
      lastSyncedAt: new Date(),
      adCount: await db.competitorAd.count({ where: { competitorId } }),
    },
  });

  return { stored: ads.length, fresh };
}
