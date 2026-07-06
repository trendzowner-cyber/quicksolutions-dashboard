import { getStats, getOrders } from "@/lib/wp-client";
import type { WCOrder } from "@/types/woocommerce";
import { StatsCard } from "@/components/dashboard/stats-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { DashboardCharts } from "./dashboard-charts";
import { AdsOverview } from "@/components/dashboard/ads-overview";
import { Package, FileText, ShoppingCart, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  let stats = { productCount: 0, postCount: 0, orderCount: 0 };
  let orders: WCOrder[] = [];

  try {
    stats = await getStats();

    const orderRes = await getOrders({
      per_page: "50",
      orderby: "date",
      order: "desc",
    });
    orders = orderRes.data.map((o) => ({
      id: o.id as number,
      number: o.number as string,
      status: o.status as string,
      date_created: o.date_created as string,
      total: (parseFloat(o.total as string) || 0).toFixed(2),
      currency: (o.currency as string) || "EUR",
      billing: (o.billing || {}) as WCOrder["billing"],
      line_items: (o.line_items || []) as WCOrder["line_items"],
    })) as WCOrder[];
  } catch {
    // Will show empty states
  }

  const totalRevenue = orders
    .filter((o) => o.status === "completed" || o.status === "processing")
    .reduce((sum, o) => sum + parseFloat(o.total), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overzicht van quicksolutionspro.be
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Producten"
          value={stats.productCount}
          icon={Package}
          description="WooCommerce producten"
        />
        <StatsCard
          title="Blog Posts"
          value={stats.postCount}
          icon={FileText}
          description="Gepubliceerde artikels"
        />
        <StatsCard
          title="Bestellingen"
          value={stats.orderCount}
          icon={ShoppingCart}
          description="Totaal aantal orders"
        />
        <StatsCard
          title="Totale Omzet"
          value={
            totalRevenue > 0 ? `€${totalRevenue.toFixed(0)}` : "—"
          }
          icon={TrendingUp}
          description="Van voltooide orders"
        />
      </div>

      {/* Charts */}
      <DashboardCharts orders={orders} />

      {/* Google Ads */}
      <AdsOverview />

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Snelle Acties</h2>
        <QuickActions />
      </div>
    </div>
  );
}
