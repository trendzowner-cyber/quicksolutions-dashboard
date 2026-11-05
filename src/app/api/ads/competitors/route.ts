import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  searchCreatives,
  searchAdvertisers,
  normalizeDomain,
  looksLikeDomain,
  storeAds,
  type TransparencyAd,
} from "@/lib/ads-transparency";

export const maxDuration = 60;

// GET /api/ads/competitors — tracked competitors with their ads, newest first.
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const competitors = await db.competitor.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        ads: { orderBy: [{ lastShown: "desc" }, { firstSeenAt: "desc" }] },
      },
    });
    return NextResponse.json({ competitors });
  } catch (error) {
    return NextResponse.json(
      { error: "Concurrenten ophalen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/ads/competitors — track a new domain (or advertiser name).
// Body: { query: "lab9.be" | "Lab9 Stores" }
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const query = String(body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "query ontbreekt" }, { status: 400 });
    }

    let domain = normalizeDomain(query);
    let advertiserId: string | null = null;
    let name: string | null = null;
    let ads: TransparencyAd[];

    if (looksLikeDomain(query)) {
      ads = await searchCreatives({ domain });
      // Domain lookups can come back empty when the brand advertises under a
      // different display domain — fall back to name resolution once.
      if (!ads.length) {
        const suggestions = await searchAdvertisers(domain.split(".")[0]);
        if (suggestions.length) {
          advertiserId = suggestions[0].advertiserId;
          name = suggestions[0].name;
          ads = await searchCreatives({ advertiserId });
        }
      }
    } else {
      const suggestions = await searchAdvertisers(query);
      if (!suggestions.length) {
        return NextResponse.json(
          { error: `Geen adverteerder gevonden voor "${query}". Probeer het domein (bijv. lab9.be).` },
          { status: 404 }
        );
      }
      advertiserId = suggestions[0].advertiserId;
      name = suggestions[0].name;
      domain = normalizeDomain(query);
      ads = await searchCreatives({ advertiserId });
      // The advertiser's real domain is on every creative — better key than
      // whatever the user typed.
      if (ads.length && looksLikeDomain(ads[0].domain)) domain = normalizeDomain(ads[0].domain);
    }

    if (!ads.length) {
      return NextResponse.json(
        { error: `Geen advertenties gevonden voor ${domain} (regio België). Adverteert dit bedrijf wel in de EU?` },
        { status: 404 }
      );
    }
    if (!name && ads[0].advertiser) name = ads[0].advertiser;
    if (!advertiserId) advertiserId = ads[0].advertiserId;

    const competitor = await db.competitor.upsert({
      where: { domain },
      create: { domain, advertiserId, name },
      update: { advertiserId, name },
    });

    const { stored, fresh } = await storeAds(competitor.id, ads);

    return NextResponse.json({
      ok: true,
      competitor: { ...competitor, adCount: await db.competitorAd.count({ where: { competitorId: competitor.id } }) },
      stored,
      fresh: fresh.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Concurrent toevoegen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/ads/competitors — stop tracking. Body: { domain }
export async function DELETE(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const domain = normalizeDomain(String(body.domain ?? ""));
    if (!domain) {
      return NextResponse.json({ error: "domain ontbreekt" }, { status: 400 });
    }
    await db.competitor.deleteMany({ where: { domain } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Verwijderen mislukt", details: String(error) },
      { status: 500 }
    );
  }
}
