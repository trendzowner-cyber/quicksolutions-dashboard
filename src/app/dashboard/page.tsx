import { getStats } from "@/lib/wp-client";
import { StatsCard } from "@/components/dashboard/stats-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Package, FileText, ShoppingCart, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  let stats = { productCount: 0, postCount: 0, orderCount: 0 };

  try {
    stats = await getStats();
  } catch {
    // Will show 0 counts if API is unreachable
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
          title="SEO Issues"
          value="—"
          icon={AlertTriangle}
          description="Start een audit om te scannen"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Snelle Acties</h2>
        <QuickActions />
      </div>
    </div>
  );
}
