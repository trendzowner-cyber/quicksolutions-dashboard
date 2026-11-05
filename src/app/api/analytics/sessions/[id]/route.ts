import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "analytics.view")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const analyticsSession = await db.analyticsSession.findUnique({
      where: { id },
    });

    if (!analyticsSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Get all events for this session
    const events = await db.analyticsEvent.findMany({
      where: { sessionId: id },
      orderBy: { occurredAt: "asc" },
      take: 500,
    });

    // Build journey: unique pages visited in order
    const pages: string[] = [];
    const seen = new Set<string>();
    for (const e of events) {
      if (e.eventName === "page_view") {
        const props = e.properties as Record<string, string> | null;
        const path = props?.page_path || "/unknown";
        if (!seen.has(path)) {
          seen.add(path);
          pages.push(path);
        }
      }
    }

    // Count event types
    const eventCounts: Record<string, number> = {};
    for (const e of events) {
      eventCounts[e.eventName] = (eventCounts[e.eventName] || 0) + 1;
    }

    // Extract purchase info
    const purchaseEvent = events.find((e) => e.eventName === "purchase");
    const purchaseProps = purchaseEvent?.properties as Record<string, unknown> | null;

    return NextResponse.json({
      session: {
        id: analyticsSession.id,
        visitorId: analyticsSession.visitorId,
        startedAt: analyticsSession.startedAt.toISOString(),
        endedAt: analyticsSession.endedAt?.toISOString() || null,
        deviceType: analyticsSession.deviceType,
        browser: analyticsSession.browser,
        os: analyticsSession.os,
        country: analyticsSession.country,
        region: analyticsSession.region,
        city: analyticsSession.city,
        source: analyticsSession.source,
        medium: analyticsSession.medium,
        campaign: analyticsSession.campaign,
        landingPage: analyticsSession.landingPage,
        pageViews: analyticsSession.pageViews,
        duration: analyticsSession.duration,
      },
      journey: pages,
      eventCounts,
      events: events.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        occurredAt: e.occurredAt.toISOString(),
        properties: e.properties,
      })),
      purchase: purchaseEvent
        ? {
            orderId: purchaseProps?.order_id,
            total: purchaseProps?.total,
            currency: purchaseProps?.currency,
            occurredAt: purchaseEvent.occurredAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error("Session detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session", details: String(error) },
      { status: 500 }
    );
  }
}
