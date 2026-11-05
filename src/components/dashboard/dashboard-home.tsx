"use client";

import { useEffect, useState } from "react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { AdsOverview } from "@/components/dashboard/ads-overview";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, FileText, ShoppingCart, TrendingUp } from "lucide-react";
import type { WCOrder } from "@/types/woocommerce";

// The operator home. Lived in src/app/dashboard/page.tsx until the client mode
// split: that page is now a thin server component that picks between this and
// the client's Vandaag screen, so the body moved here unchanged.
export function DashboardHome() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ productCount: 0, postCount: 0, orderCount: 0 });
  const [orders, setOrders] = useState<WCOrder[]>([]);
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, ordersRes] = await Promise.all([
          fetch("/api/wp/stats").then((r) => r.json()),
          fetch("/api/wp/orders?per_page=50&orderby=date&order=desc").then((r) => r.json()),
        ]);
        setStats(statsRes);
        const ords = (ordersRes.data || []).map((o: Record<string, unknown>) => ({
          id: o.id as number, number: o.number as string, status: o.status as string,
          date_created: o.date_created as string, total: (parseFloat(o.total as string) || 0).toFixed(2),
          currency: (o.currency as string) || "EUR",
          billing: (o.billing || {}) as WCOrder["billing"],
          line_items: (o.line_items || []) as WCOrder["line_items"],
        })) as WCOrder[];
        setOrders(ords);
        setRevenue(
          ords.filter((o: WCOrder) => o.status === "completed" || o.status === "processing")
            .reduce((s: number, o: WCOrder) => s + parseFloat(o.total), 0)
        );
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight">Dashboard</h1></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-[250px] w-full rounded-lg" /></div>
          <div className="rounded-xl border border-border bg-card p-6 space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-[250px] w-full rounded-lg" /></div>
        </div>
      </div>
    );
  }

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
      <AdsOverview />
      <div><h2 className="text-lg font-semibold mb-3">Snelle Acties</h2><QuickActions /></div>
    </div>
  );
}
