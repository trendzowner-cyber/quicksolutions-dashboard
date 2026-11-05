import { db } from "./db";
import { Prisma } from "@/generated/prisma/client";

// ─── Constants ───
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVE_THRESHOLD_MS = 60 * 1000; // 60 seconds for "live"
const HEARTBEAT_INTERVAL_MS = 15 * 1000; // 15 seconds

// ─── Types ───
export interface AnalyticsEventInput {
  eventName: string;
  sessionId: string;
  visitorId: string;
  occurredAt?: string;
  properties?: Record<string, unknown>;
}

// ─── Deduplication ───
const processedEventIds = new Set<string>();
const MAX_DEDUP_SIZE = 10000;

function isDuplicate(event: AnalyticsEventInput): boolean {
  let key: string;
  if (event.eventName === "purchase" && event.properties?.order_id) {
    // Dedup purchases by order_id — prevents double-counting when both
    // the JS tracker and PHP server-side relay fire for the same order
    key = `purchase:order:${event.properties.order_id}`;
  } else {
    key = `${event.eventName}:${event.sessionId}`;
  }
  if (processedEventIds.has(key)) return true;
  processedEventIds.add(key);
  if (processedEventIds.size > MAX_DEDUP_SIZE) {
    const entries = [...processedEventIds];
    entries.slice(0, 5000).forEach(e => processedEventIds.delete(e));
  }
  return false;
}

// ─── Event Ingestion ───
export async function ingestEvent(event: AnalyticsEventInput): Promise<void> {
  try {
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();

    // Skip duplicate non-heartbeat events
    if (event.eventName !== "heartbeat" && isDuplicate(event)) {
      return;
    }

    // Insert event
    await db.analyticsEvent.create({
      data: {
        eventName: event.eventName,
        sessionId: event.sessionId,
        visitorId: event.visitorId,
        occurredAt,
        properties: (event.properties || {}) as Prisma.InputJsonValue,
      },
    });

    // Update session
    const session = await db.analyticsSession.findUnique({
      where: { id: event.sessionId },
    });

    if (!session) {
      // Create new session
      const props = event.properties || {};
      await db.analyticsSession.create({
        data: {
          id: event.sessionId,
          visitorId: event.visitorId,
          startedAt: occurredAt,
          deviceType: props.deviceCategory as string || null,
          browser: props.browser as string || null,
          os: props.os as string || null,
          country: props.country as string || null,
          region: props.region as string || null,
          city: props.city as string || null,
          source: props.utm_source as string || null,
          medium: props.utm_medium as string || null,
          campaign: props.utm_campaign as string || null,
          landingPage: (props.landing_page as string) || (props.page_path as string) || null,
          pageViews: event.eventName === "page_view" ? 1 : 0,
        },
      });
    } else {
      // Update existing session
      const updateData: Record<string, unknown> = {};
      if (event.eventName === "page_view") {
        updateData.pageViews = { increment: 1 };
      }
      // Update last activity time implicitly via updatedAt
      await db.analyticsSession.update({
        where: { id: event.sessionId },
        data: updateData as any,
      });
    }
  } catch (error) {
    console.error("Analytics ingestion error:", error);
    // Never throw — analytics failures must not break the app
  }
}

// ─── Session Management ───
export async function endExpiredSessions(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
    const result = await db.analyticsSession.updateMany({
      where: {
        endedAt: null,
        updatedAt: { lt: cutoff },
      },
      data: {
        endedAt: new Date(),
      },
    });
    return result.count;
  } catch {
    return 0;
  }
}

// ─── Live Presence ───
export async function getLivePresence() {
  try {
    const activeCutoff = new Date(Date.now() - ACTIVE_THRESHOLD_MS);

    // Live sessions (had activity in last 60 seconds)
    const liveSessions = await db.analyticsSession.findMany({
      where: {
        endedAt: null,
        updatedAt: { gte: activeCutoff },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const sessionCutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);

    // Active sessions (ongoing, within 30 min)
    const activeSessions = await db.analyticsSession.findMany({
      where: {
        endedAt: null,
        startedAt: { gte: sessionCutoff },
      },
    });

    // Active carts/checkouts from recent events
    const recentCartEvents = await db.analyticsEvent.findMany({
      where: {
        eventName: { in: ["add_to_cart", "begin_checkout", "view_cart"] },
        occurredAt: { gte: activeCutoff },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });

    // Orders in last 60 minutes
    const orderCutoff = new Date(Date.now() - 60 * 60 * 1000);
    const recentOrders = await db.analyticsEvent.findMany({
      where: {
        eventName: "purchase",
        occurredAt: { gte: orderCutoff },
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
    });

    const liveVisitors = liveSessions.length;
    const activeCarts = recentCartEvents.filter(e => e.eventName === "add_to_cart" || e.eventName === "view_cart").length;
    const activeCheckouts = recentCartEvents.filter(e => e.eventName === "begin_checkout").length;

    return {
      liveVisitors,
      activeSessions: activeSessions.length,
      activeCarts,
      activeCheckouts,
      recentOrders: recentOrders.length,
      liveSessions: liveSessions.map(s => ({
        id: s.id,
        visitorId: s.visitorId,
        country: s.country,
        city: s.city,
        deviceType: s.deviceType,
        browser: s.browser,
        source: s.source,
        medium: s.medium,
        campaign: s.campaign,
        landingPage: s.landingPage,
        pageViews: s.pageViews,
        startedAt: s.startedAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("Live presence error:", error);
    return {
      liveVisitors: 0,
      activeSessions: 0,
      activeCarts: 0,
      activeCheckouts: 0,
      recentOrders: 0,
      liveSessions: [],
    };
  }
}

// ─── Geo lookup from request ───
export function extractGeoFromRequest(request: Request): {
  country?: string;
  region?: string;
  city?: string;
} {
  // Cloudflare headers (if behind Cloudflare)
  const country = request.headers.get("cf-ipcountry") || undefined;
  const region = request.headers.get("cf-region") || undefined;
  const city = request.headers.get("cf-ipcity") || undefined;

  // Vercel headers
  const vercelCountry = request.headers.get("x-vercel-ip-country") || undefined;
  const vercelRegion = request.headers.get("x-vercel-ip-country-region") || undefined;
  const vercelCity = request.headers.get("x-vercel-ip-city") || undefined;

  return {
    country: country || vercelCountry,
    region: region || vercelRegion,
    city: city || vercelCity,
  };
}

// ─── Statistics ───
export async function getAnalyticsStats() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalEvents, totalSessions, todayEvents] = await Promise.all([
      db.analyticsEvent.count(),
      db.analyticsSession.count(),
      db.analyticsEvent.count({
        where: { occurredAt: { gte: today } },
      }),
    ]);

    return {
      totalEvents,
      totalSessions,
      todayEvents,
      status: "healthy",
      lastEventAt: null as string | null,
    };
  } catch {
    return {
      totalEvents: 0,
      totalSessions: 0,
      todayEvents: 0,
      status: "error",
      lastEventAt: null,
    };
  }
}
