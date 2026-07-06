import { Suspense } from "react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { AdsOverview } from "@/components/dashboard/ads-overview";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, FileText, ShoppingCart, TrendingUp } from "lucide-react";
import { DashboardData } from "./dashboard-data";

export const dynamic = "force-dynamic";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overzicht van quicksolutionspro.be</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardHome() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardData />
      <div className="pt-6">
        <AdsOverview />
      </div>
      <div className="pt-6">
        <h2 className="text-lg font-semibold mb-3">Snelle Acties</h2>
        <QuickActions />
      </div>
    </Suspense>
  );
}
