import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";

// Standard ecommerce funnel: View → Add to cart → Begin checkout → Purchase
const FUNNEL_STEPS = ["product_view", "add_to_cart", "begin_checkout", "purchase"] as const;

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "analytics.view")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // Get unique sessions per funnel step
    const stepData = await Promise.all(
      FUNNEL_STEPS.map((step) =>
        db.analyticsEvent.groupBy({
          by: ["sessionId"],
          where: {
            eventName: step,
            occurredAt: { gte: since },
          },
        })
      )
    );

    const counts = stepData.map((d) => d.length);

    // Build funnel with conversion rates
    const funnel = FUNNEL_STEPS.map((step, i) => ({
      step,
      label: FUNNEL_LABELS[step] || step,
      sessions: counts[i],
      conversionRate:
        i === 0 ? 100 : counts[0] > 0 ? Math.round((counts[i] / counts[0]) * 10000) / 100 : 0,
      dropOff:
        i === 0
          ? 0
          : counts[i - 1] > 0
          ? Math.round(((counts[i - 1] - counts[i]) / counts[i - 1]) * 10000) / 100
          : 0,
    }));

    // Overall conversion: product views → purchases
    const overallRate =
      counts[0] > 0
        ? Math.round((counts[3] / counts[0]) * 10000) / 100
        : 0;

    // Daily funnel data for trend chart
    const dailyFunnel: Record<
      string,
      { product_view: number; add_to_cart: number; begin_checkout: number; purchase: number }
    > = {};

    for (let d = 0; d < days; d++) {
      const dayStart = new Date(since.getTime() + d * 86400000);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const key = dayStart.toISOString().slice(0, 10);

      const daily = await Promise.all(
        FUNNEL_STEPS.map((step) =>
          db.analyticsEvent.groupBy({
            by: ["sessionId"],
            where: {
              eventName: step,
              occurredAt: { gte: dayStart, lt: dayEnd },
            },
          })
        )
      );

      dailyFunnel[key] = {
        product_view: daily[0].length,
        add_to_cart: daily[1].length,
        begin_checkout: daily[2].length,
        purchase: daily[3].length,
      };
    }

    // Page-level conversion: top product pages → purchases
    const productPageViews = await db.analyticsEvent.groupBy({
      by: ["properties"],
      where: {
        eventName: "product_view",
        occurredAt: { gte: since },
      },
      _count: true,
      orderBy: { _count: { eventName: "desc" } },
      take: 20,
    });

    // Get add_to_cart events to calculate product-level conversion
    const productAddToCarts = await db.analyticsEvent.groupBy({
      by: ["properties"],
      where: {
        eventName: "add_to_cart",
        occurredAt: { gte: since },
      },
      _count: true,
    });

    // Build product conversion map
    const atcMap = new Map<string, number>();
    for (const e of productAddToCarts) {
      const props = e.properties as Record<string, string> | null;
      const pid = props?.product_id;
      if (pid) atcMap.set(pid, (atcMap.get(pid) || 0) + e._count);
    }

    const productConversion = productPageViews
      .map((p) => {
        const props = p.properties as Record<string, string> | null;
        const pid = props?.product_id;
        const views = p._count;
        const adds = pid ? atcMap.get(pid) || 0 : 0;
        return {
          productId: pid || "unknown",
          productName: props?.product_name || "Unknown",
          category: props?.product_category || null,
          views,
          addToCarts: adds,
          conversionRate: views > 0 ? Math.round((adds / views) * 10000) / 100 : 0,
        };
      })
      .sort((a, b) => b.views - a.views);

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      funnel,
      overallConversionRate: overallRate,
      dailyFunnel: Object.entries(dailyFunnel).map(([date, data]) => ({
        date,
        ...data,
      })),
      productConversion,
    });
  } catch (error) {
    console.error("Funnel error:", error);
    return NextResponse.json(
      { error: "Failed to fetch funnel data", details: String(error) },
      { status: 500 }
    );
  }
}

const FUNNEL_LABELS: Record<string, string> = {
  product_view: "Product bekeken",
  add_to_cart: "Toegevoegd aan winkelwagen",
  begin_checkout: "Checkout gestart",
  purchase: "Aankoop",
};
