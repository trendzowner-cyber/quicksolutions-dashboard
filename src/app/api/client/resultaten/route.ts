// The client's numbers, in one place.
//
// This exists because every operator endpoint is the wrong shape for Azedine,
// in one of two ways. `/api/analytics/stats` is gated on `analytics.view`, which
// a `viewer` does not have, so the page would 403 before it drew anything — and
// widening the role is not the fix, because five other `viewer` accounts (the
// review team) would gain analytics with it. The ones he *can* already reach
// return operator internals instead: `/api/reviews/insights` ships team activity
// and the fake-score buckets, and the remover scorecard is a ledger of what he
// owes. None of that belongs on a four-card phone screen.
//
// So: one endpoint, gated the same way the rest of client mode is — on the user
// id, never the role — returning exactly what the Resultaten page draws.
//
// Nothing here is allowed to throw at the caller. A block that cannot be
// computed comes back null and the page says so in a sentence, because the
// client cannot reconnect Google Ads or restart WooCommerce: an error he cannot
// act on is just a dead end in a scary colour.
//
// `?block=ads` returns only the ads block. The Google Ads round trip is several
// times slower than everything else put together, and the page fires both
// requests at once so the three fast cards are readable while ads is still in
// flight.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { db } from "@/lib/db";
import { getOrders } from "@/lib/wp-client";
import { getCached, setCache } from "@/lib/cache";
import {
  fetchDailyTotals,
  costPerConversion,
  ctrOf,
  roasOf,
  getAdAccessToken,
  ADS_ACCOUNTS,
  accountLabel,
} from "@/lib/google-ads";

export const maxDuration = 30;

/** The window every block reports on, so the four cards cannot disagree. */
const DAYS = 30;
const DAY_MS = 86_400_000;

/** WooCommerce and Google Ads are both slow and both slow-changing. */
const ORDERS_TTL = 300;
const ADS_TTL = 900;

interface ReviewsBlock {
  /**
   * Straight from Google, via the place row the Outscraper sync keeps current.
   * The card leads with this because it is the number the client sees when he
   * opens Google himself — our own tracked count is a subset of it, and showing
   * the smaller one first would read as a contradiction rather than as detail.
   */
  googleRating: number | null;
  googleTotal: number | null;
  ratingUpdatedAt: string | null;
  /** The reviews we actually hold: scored, answerable, tracked. */
  tracked: number;
  newInPeriod: number;
  answered: number;
  responseRate: number | null;
}

interface WebsiteBlock {
  visitors: number;
  visitorsBefore: number;
  pageViews: number;
  sessions: number;
  topPages: { path: string; views: number }[];
}

interface OrdersBlock {
  count: number;
  revenue: number;
  currency: string;
}

interface AdsBlock {
  connected: boolean;
  /** Which account the numbers came from, already humanised. */
  account?: string;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  ctr?: number;
  costPerConversion?: number | null;
  roas?: number | null;
}

// ─── Reviews ────────────────────────────────────────────────────────────────

async function reviewsBlock(now: Date): Promise<ReviewsBlock | null> {
  try {
    const [rows, place, sync] = await Promise.all([
      db.googleReview.findMany({
        select: { starRating: true, status: true, replyText: true, createTime: true },
      }),
      db.googlePlace.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { rating: true, reviewCount: true, updatedAt: true },
      }),
      // Two writers keep these same two numbers, on different cadences. Places
      // needs billing that was never enabled, so its row can legitimately be
      // absent; the Outscraper sync is the one that is actually alive.
      db.outscraperSync.findFirst({
        where: { id: "main" },
        select: { rating: true, reviewCount: true, updatedAt: true },
      }),
    ]);

    const source = place ?? sync;

    // "Active" is the same definition the operator side uses: a review that is
    // still on the profile. Removed and came-back rows are excluded.
    const active = rows.filter((r) => r.status === "active");
    const periodStart = new Date(now.getTime() - DAYS * DAY_MS);
    const answered = active.filter((r) => r.replyText).length;

    return {
      googleRating: source?.rating ?? null,
      googleTotal: source?.reviewCount ?? null,
      ratingUpdatedAt: source?.updatedAt?.toISOString() ?? null,
      tracked: active.length,
      newInPeriod: rows.filter((r) => r.createTime && r.createTime >= periodStart)
        .length,
      answered,
      responseRate:
        active.length > 0 ? Math.round((answered / active.length) * 100) : null,
    };
  } catch (error) {
    console.error("Client resultaten: reviews block failed", error);
    return null;
  }
}

// ─── Website ────────────────────────────────────────────────────────────────

async function websiteBlock(now: Date): Promise<WebsiteBlock | null> {
  try {
    const periodStart = new Date(now.getTime() - DAYS * DAY_MS);
    const beforeStart = new Date(now.getTime() - 2 * DAYS * DAY_MS);

    const [visitorRows, visitorRowsBefore, pageViews, sessions, pageViewEvents] =
      await Promise.all([
        db.analyticsEvent.groupBy({
          by: ["visitorId"],
          where: { occurredAt: { gte: periodStart } },
        }),
        db.analyticsEvent.groupBy({
          by: ["visitorId"],
          where: { occurredAt: { gte: beforeStart, lt: periodStart } },
        }),
        db.analyticsEvent.count({
          where: { eventName: "page_view", occurredAt: { gte: periodStart } },
        }),
        db.analyticsSession.count({ where: { startedAt: { gte: periodStart } } }),
        // Aggregated in JS rather than with a groupBy on `properties`: that
        // column is a JSON blob, so Postgres groups by the *whole blob* and one
        // page fragments into a row per distinct title. The window is a few
        // thousand rows, which is nothing next to being wrong.
        db.analyticsEvent.findMany({
          where: { eventName: "page_view", occurredAt: { gte: periodStart } },
          select: { properties: true },
        }),
      ]);

    const counts = new Map<string, number>();
    for (const event of pageViewEvents) {
      const props = event.properties as Record<string, unknown> | null;
      const path = typeof props?.page_path === "string" ? props.page_path : null;
      if (!path) continue;
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }

    const topPages = [...counts.entries()]
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 3);

    return {
      visitors: visitorRows.length,
      visitorsBefore: visitorRowsBefore.length,
      pageViews,
      sessions,
      topPages,
    };
  } catch (error) {
    console.error("Client resultaten: website block failed", error);
    return null;
  }
}

// ─── Bestellingen ───────────────────────────────────────────────────────────

async function ordersBlock(now: Date): Promise<OrdersBlock | null> {
  const cached = getCached<OrdersBlock>("client-resultaten-orders");
  if (cached) return cached;

  try {
    // One page of 100 covers a month at this shop's volume; the X-WP-Total
    // header is the real count, so the number stays right even if it is ever
    // wrong about that.
    const { data, headers } = await getOrders({
      per_page: "100",
      after: new Date(now.getTime() - DAYS * DAY_MS).toISOString(),
      orderby: "date",
      order: "desc",
    });

    const count = Number.parseInt(headers.get("X-WP-Total") || "0", 10);

    let revenue = 0;
    let currency = "EUR";
    for (const order of data as Record<string, unknown>[]) {
      revenue += Number(order.total) || 0;
      if (typeof order.currency === "string") currency = order.currency;
    }

    const block: OrdersBlock = {
      count: Number.isFinite(count) ? count : data.length,
      revenue: Number(revenue.toFixed(2)),
      currency,
    };
    setCache("client-resultaten-orders", block, ORDERS_TTL);
    return block;
  } catch (error) {
    console.error("Client resultaten: orders block failed", error);
    return null;
  }
}

// ─── Ads ────────────────────────────────────────────────────────────────────

async function adsBlock(): Promise<AdsBlock> {
  const cached = getCached<AdsBlock>("client-resultaten-ads");
  if (cached) return cached;

  try {
    const accessToken = await getAdAccessToken();
    const customerId = ADS_ACCOUNTS[0];
    const { totals } = await fetchDailyTotals(
      accessToken,
      customerId,
      `LAST_${DAYS}_DAYS`
    );

    const block: AdsBlock = {
      connected: true,
      account: accountLabel(customerId),
      spend: Number((totals.costMicros / 1_000_000).toFixed(2)),
      clicks: totals.clicks,
      impressions: totals.impressions,
      conversions: Number(totals.conversions.toFixed(1)),
      ctr: ctrOf(totals),
      costPerConversion: costPerConversion(totals),
      roas: roasOf(totals),
    };
    setCache("client-resultaten-ads", block, ADS_TTL);
    return block;
  } catch (error) {
    // An unconnected or expired Ads token is a state, not a failure — the card
    // says "nog niet gekoppeld" rather than showing him an OAuth error.
    console.error("Client resultaten: ads block failed", error);
    return { connected: false };
  }
}

// ─── Route ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The user id, not the role: five other `viewer` accounts exist and none of
  // them is the client.
  if (!isClientUserId(session.userId)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const now = new Date();
  const headers = { "Cache-Control": "no-store" };

  if (request.nextUrl.searchParams.get("block") === "ads") {
    return NextResponse.json({ ads: await adsBlock() }, { headers });
  }

  // The fast three. Each block already swallows its own failure, so these run
  // together and one dead source cannot take the other two down with it.
  const [reviews, website, orders] = await Promise.all([
    reviewsBlock(now),
    websiteBlock(now),
    ordersBlock(now),
  ]);

  return NextResponse.json(
    { periodDays: DAYS, reviews, website, orders },
    { headers }
  );
}
