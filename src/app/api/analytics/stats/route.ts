import { NextResponse } from "next/server";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "analytics.view")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    // First batch: counts & groupings (max 10 for TS tuple inference)
    const [
      totalEvents,
      todayEvents,
      yesterdayEvents,
      totalSessions,
      todaySessions,
      weekSessions,
      activeSessions,
      topPagesRaw,
    ] = await Promise.all([
      db.analyticsEvent.count(),
      db.analyticsEvent.count({ where: { occurredAt: { gte: today } } }),
      db.analyticsEvent.count({ where: { occurredAt: { gte: yesterday, lt: today } } }),
      db.analyticsSession.count(),
      db.analyticsSession.count({ where: { startedAt: { gte: today } } }),
      db.analyticsSession.count({ where: { startedAt: { gte: weekAgo } } }),
      db.analyticsSession.count({
        where: { endedAt: null, startedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
      }),
      db.analyticsEvent.groupBy({
        by: ["properties"],
        where: { eventName: "page_view", occurredAt: { gte: today } },
        _count: true,
        orderBy: { _count: { eventName: "desc" } },
        take: 10,
      }),
    ]);

    // Second batch: breakdowns + meta
    const [deviceBreakdown, sourceBreakdown, countryBreakdown, lastEvent, distinctVisitors] =
      await Promise.all([
        db.analyticsSession.groupBy({
          by: ["deviceType"],
          where: { startedAt: { gte: today } },
          _count: true,
        }),
        db.analyticsSession.groupBy({
          by: ["source"],
          where: { startedAt: { gte: today } },
          _count: true,
        }),
        db.analyticsSession.groupBy({
          by: ["country"],
          where: { startedAt: { gte: today } },
          _count: true,
        }),
        db.analyticsEvent.findFirst({
          orderBy: { occurredAt: "desc" },
          select: { occurredAt: true, eventName: true },
        }),
        db.analyticsEvent.groupBy({
          by: ["visitorId"],
          where: { occurredAt: { gte: weekAgo } },
        }),
      ]);

    // Third: purchases & revenue — dedup by order_id so duplicate
    // events (JS tracker + PHP server-side relay) don't inflate numbers
    function dedupPurchases(events: { properties: unknown }[]) {
      const seen = new Set<string>();
      const unique: { properties: unknown }[] = [];
      for (const e of events) {
        const props = e.properties as Record<string, unknown> | null;
        const oid = props?.order_id ? String(props.order_id) : null;
        // If no order_id, keep it but dedup by a hash of the full properties
        const key = oid || JSON.stringify(props);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(e);
      }
      return unique;
    }

    function calcRevenue(events: { properties: unknown }[]): number {
      return events.reduce((sum, e) => {
        const props = e.properties as Record<string, unknown> | null;
        return sum + (Number(props?.total) || Number(props?.order_total) || 0);
      }, 0);
    }

    const [todayPurchaseRows, weekPurchaseRows] = await Promise.all([
      db.analyticsEvent.findMany({
        where: { eventName: "purchase", occurredAt: { gte: today } },
        select: { properties: true },
      }),
      db.analyticsEvent.findMany({
        where: { eventName: "purchase", occurredAt: { gte: weekAgo } },
        select: { properties: true },
      }),
    ]);

    const todayUnique = dedupPurchases(todayPurchaseRows);
    const weekUnique = dedupPurchases(weekPurchaseRows);

    // Process top pages from JSON properties
    const topPages = topPagesRaw
      .map((p) => {
        const props = p.properties as Record<string, string> | null;
        return {
          path: props?.page_path || "/unknown",
          title: props?.page_title || "",
          views: p._count,
        };
      })
      .sort((a, b) => b.views - a.views);

    return NextResponse.json({
      overview: {
        totalEvents,
        todayEvents,
        yesterdayEvents,
        totalSessions,
        todaySessions,
        weekSessions,
        activeSessions,
        todayPurchases: todayUnique.length,
        todayRevenue: calcRevenue(todayUnique),
        weekPurchases: weekUnique.length,
        weekRevenue: calcRevenue(weekUnique),
        weekVisitors: distinctVisitors.length,
      },
      topPages,
      deviceBreakdown: deviceBreakdown.map((d) => ({
        type: d.deviceType || "unknown",
        count: d._count,
      })),
      sourceBreakdown: sourceBreakdown
        .map((s) => ({ source: s.source || "direct", count: s._count }))
        .sort((a, b) => b.count - a.count),
      countryBreakdown: countryBreakdown
        .map((c) => ({ country: c.country || "unknown", count: c._count }))
        .sort((a, b) => b.count - a.count),
      lastEvent: lastEvent
        ? { at: lastEvent.occurredAt.toISOString(), type: lastEvent.eventName }
        : null,
      status: "healthy",
    });
  } catch (error) {
    console.error("Analytics stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics stats", details: String(error) },
      { status: 500 }
    );
  }
}
