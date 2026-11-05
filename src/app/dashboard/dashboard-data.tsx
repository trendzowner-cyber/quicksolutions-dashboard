import { getStats, getOrders } from "@/lib/wp-client";
import type { WCOrder } from "@/types/woocommerce";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { Package, FileText, ShoppingCart, TrendingUp } from "lucide-react";

export async function DashboardData() {
  let stats = { productCount: 0, postCount: 0, orderCount: 0 };
  let orders: WCOrder[] = [];

  try {
    const [statsResult, orderRes] = await Promise.all([
      getStats(),
      getOrders({ per_page: "50", orderby: "date", order: "desc" }),
    ]);
    stats = statsResult;
    orders = orderRes.data.map((o) => ({
      id: o.id as number, number: o.number as string, status: o.status as string,
      date_created: o.date_created as string, total: (parseFloat(o.total as string) || 0).toFixed(2),
      currency: (o.currency as string) || "EUR",
      billing: (o.billing || {}) as WCOrder["billing"],
      line_items: (o.line_items || []) as WCOrder["line_items"],
    })) as WCOrder[];
  } catch {}

  const revenue = orders
    .filter((o) => o.status === "completed" || o.status === "processing")
    .reduce((s, o) => s + parseFloat(o.total), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overzicht van quicksolutionspro.be</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Producten" value={stats.productCount} icon={Package} gradient="blue" description="WooCommerce catalogus" />
        <StatsCard title="Blog Posts" value={stats.postCount} icon={FileText} gradient="violet" description="Gepubliceerde artikels" />
        <StatsCard title="Bestellingen" value={stats.orderCount} icon={ShoppingCart} gradient="emerald" description="Totaal aantal orders" />
        <StatsCard title="Totale Omzet" value={revenue > 0 ? `€${revenue.toFixed(0)}` : "—"} icon={TrendingUp} gradient="amber" description="Voltooide orders" />
      </div>

      <DashboardCharts orders={orders} />
    </div>
  );
}
