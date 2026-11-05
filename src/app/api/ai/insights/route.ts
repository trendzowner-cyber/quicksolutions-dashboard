import { getSessionUser, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, "analytics.view")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);

    // Revenue
    const monthPurchases = await db.analyticsEvent.findMany({
      where: { eventName: "purchase", occurredAt: { gte: monthAgo } },
      select: { properties: true, occurredAt: true, sessionId: true },
      orderBy: { occurredAt: "asc" },
    });

    const weekPurchases = monthPurchases.filter((p) => new Date(p.occurredAt) >= weekAgo);

    function revenueFrom(events: typeof monthPurchases): number {
      return events.reduce((sum, e) => {
        const props = e.properties as Record<string, number> | null;
        return sum + (Number(props?.total) || 0);
      }, 0);
    }

    const weekRev = revenueFrom(weekPurchases);
    const monthRev = revenueFrom(monthPurchases);
    const avgOrderValue = monthPurchases.length > 0 ? monthRev / monthPurchases.length : 0;

    // Sessions & visitors
    const [weekSessions, monthSessions, weekVisitors, monthVisitors, deviceSplit, topSources, avgPagesResult] =
      await Promise.all([
        db.analyticsSession.count({ where: { startedAt: { gte: weekAgo } } }),
        db.analyticsSession.count({ where: { startedAt: { gte: monthAgo } } }),
        db.analyticsEvent.groupBy({ by: ["visitorId"], where: { occurredAt: { gte: weekAgo } } }).then((r) => r.length),
        db.analyticsEvent.groupBy({ by: ["visitorId"], where: { occurredAt: { gte: monthAgo } } }).then((r) => r.length),
        db.analyticsSession.groupBy({ by: ["deviceType"], where: { startedAt: { gte: monthAgo } }, _count: true }),
        db.analyticsSession.groupBy({ by: ["source"], where: { startedAt: { gte: monthAgo } }, _count: true, orderBy: { _count: { source: "desc" } }, take: 5 }),
        db.analyticsSession.aggregate({ where: { startedAt: { gte: weekAgo } }, _avg: { pageViews: true } }),
      ]);

    // Blog attribution — find sessions with both blog page views and purchases
    const purchaseSessionIds = [...new Set(monthPurchases.map((p) => p.sessionId))];

    let blogAttributedSales = 0;
    if (purchaseSessionIds.length > 0) {
      const blogPageViews = await db.analyticsEvent.findMany({
        where: {
          eventName: "page_view",
          sessionId: { in: purchaseSessionIds.slice(0, 100) },
          occurredAt: { gte: monthAgo },
        },
        select: { sessionId: true, properties: true },
        take: 500,
      });

      const blogSessions = new Set<string>();
      for (const e of blogPageViews) {
        const props = e.properties as Record<string, string> | null;
        if (props?.page_path?.includes("/blog/") || props?.page_path?.includes("/category/")) {
          blogSessions.add(e.sessionId);
        }
      }
      blogAttributedSales = blogSessions.size;
    }

    // Build insights
    const insights: Insight[] = [];

    if (weekRev > 0) {
      insights.push({
        type: "revenue", title: "Omzet deze week",
        value: `€${Math.round(weekRev).toLocaleString("nl-BE")}`,
        detail: `${monthPurchases.length} orders in 30 dagen`,
        severity: "positive",
      });
    }

    const avgPages = avgPagesResult._avg.pageViews || 0;
    insights.push({
      type: "traffic", title: "Sessies deze week",
      value: `${weekSessions}`,
      detail: `${weekVisitors} unieke bezoekers • ~${Math.round(avgPages)} pp/sessie`,
      severity: weekSessions > 0 ? "positive" : "neutral",
    });

    if (avgOrderValue > 0) {
      insights.push({
        type: "sales", title: "Gem. orderwaarde (30d)",
        value: `€${Math.round(avgOrderValue).toLocaleString("nl-BE")}`,
        detail: `${monthPurchases.length} orders`,
        severity: avgOrderValue > 50 ? "positive" : "neutral",
      });
    }

    if (blogAttributedSales > 0) {
      insights.push({
        type: "content", title: "Blog → Verkoop",
        value: `${blogAttributedSales} sessies`,
        detail: "Bezoekers die blog lazen en kochten",
        severity: "positive",
      });
    }

    const organicSource = topSources.find((s) => s.source === "google" || s.source === "organic");
    const totalSourceCount = topSources.reduce((s, d) => s + d._count, 0);
    if (organicSource) {
      const pct = totalSourceCount > 0 ? Math.round((organicSource._count / totalSourceCount) * 100) : 0;
      insights.push({
        type: "traffic", title: "Organisch verkeer",
        value: `${pct}%`, detail: `${organicSource._count} sessies via zoekmachines`,
        severity: pct > 20 ? "positive" : "neutral",
      });
    }

    const mobileCount = deviceSplit.find((d) => d.deviceType === "mobile")?._count || 0;
    const totalDevices = deviceSplit.reduce((s, d) => s + d._count, 0);
    const mobilePct = totalDevices > 0 ? Math.round((mobileCount / totalDevices) * 100) : 0;
    if (mobilePct > 0) {
      insights.push({
        type: "technical", title: "Mobiel verkeer",
        value: `${mobilePct}%`,
        detail: mobilePct > 70 ? "Check mobiele ervaring" : "Prima verdeling",
        severity: mobilePct > 70 ? "warning" : "neutral",
      });
    }

    return NextResponse.json({
      insights,
      metrics: {
        weekRevenue: Math.round(weekRev * 100) / 100,
        monthRevenue: Math.round(monthRev * 100) / 100,
        weekSessions, monthSessions, weekVisitors, monthVisitors,
        monthOrders: monthPurchases.length,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        blogAttributedSales,
      },
      sources: topSources.map((s) => ({ source: s.source || "direct", count: s._count })),
      devices: deviceSplit.map((d) => ({ type: d.deviceType || "unknown", count: d._count })),
    });
  } catch (error) {
    console.error("Insights error:", error);
    return NextResponse.json({ insights: [], metrics: {}, error: String(error) }, { status: 500 });
  }
}

interface Insight {
  type: string; title: string; value: string; detail: string; severity: "positive" | "warning" | "neutral";
}
