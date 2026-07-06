import { getStats } from "@/lib/wp-client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { AdsOverview } from "@/components/dashboard/ads-overview";
import { Package, FileText, ShoppingCart, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  let stats = { productCount: 0, postCount: 0, orderCount: 0 };

  try {
    stats = await getStats();
  } catch {
    // Will show empty states
  }

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
          gradient="blue"
          description="WooCommerce catalogus"
        />
        <StatsCard
          title="Blog Posts"
          value={stats.postCount}
          icon={FileText}
          gradient="violet"
          description="Gepubliceerde artikels"
        />
        <StatsCard
          title="Bestellingen"
          value={stats.orderCount}
          icon={ShoppingCart}
          gradient="emerald"
          description="Totaal aantal orders"
        />
        <StatsCard
          title="Totale Omzet"
          value="—"
          icon={TrendingUp}
          gradient="amber"
          description="Start een audit"
        />
      </div>

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
