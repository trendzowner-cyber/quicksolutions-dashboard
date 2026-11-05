"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Lightbulb, TrendingUp, Users, ShoppingCart, Euro,
  Globe, Eye, FileText, Monitor, Smartphone, ArrowUp, ArrowDown,
} from "lucide-react";

interface Insight {
  type: string; title: string; value: string;
  detail: string; severity: "positive" | "warning" | "neutral";
}

interface InsightsData {
  insights: Insight[];
  metrics: {
    weekRevenue: number; monthRevenue: number;
    weekSessions: number; monthSessions: number;
    weekVisitors: number; monthVisitors: number;
    monthOrders: number; avgOrderValue: number;
    blogAttributedSales: number;
  };
  sources: { source: string; count: number }[];
  devices: { type: string; count: number }[];
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  revenue: Euro, traffic: Globe, sales: ShoppingCart,
  content: FileText, technical: Monitor,
};
const SEVERITY_COLORS: Record<string, string> = {
  positive: "border-emerald-500/20 bg-emerald-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  neutral: "border-border bg-muted/20",
};

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/insights")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const { insights, metrics, sources, devices } = data || { insights: [], metrics: null, sources: [], devices: [] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Inzichten</h1>
        <p className="text-muted-foreground text-sm">Business intelligence op basis van echte data</p>
      </div>

      {/* Key Metric Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Omzet (7d)"
            value={`€${Math.round(metrics.weekRevenue).toLocaleString("nl-BE")}`}
            sub={`€${Math.round(metrics.monthRevenue).toLocaleString("nl-BE")} in 30d`}
            icon={Euro} color="text-emerald-400"
          />
          <MetricCard
            label="Sessies (7d)"
            value={metrics.weekSessions.toString()}
            sub={`${metrics.weekVisitors} unieke bezoekers`}
            icon={Users} color="text-blue-400"
          />
          <MetricCard
            label="Orders (30d)"
            value={metrics.monthOrders.toString()}
            sub={`€${Math.round(metrics.avgOrderValue).toLocaleString("nl-BE")} gem. per order`}
            icon={ShoppingCart} color="text-violet-400"
          />
          <MetricCard
            label="Blog → Sales"
            value={metrics.blogAttributedSales.toString()}
            sub="Sessies met blog + aankoop"
            icon={FileText} color="text-amber-400"
          />
        </div>
      )}

      {/* Insights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.map((insight, i) => {
          const Icon = TYPE_ICONS[insight.type] || Lightbulb;
          return (
            <Card key={i} className={`border ${SEVERITY_COLORS[insight.severity]}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">{insight.type}</Badge>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{insight.title}</p>
                  <p className="text-2xl font-bold mt-0.5">{insight.value}</p>
                </div>
                <p className="text-xs text-muted-foreground">{insight.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Bar Charts — Sources + Devices */}
      {sources.length > 0 && devices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" /> Verkeersbronnen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sources.map((s) => {
                  const max = sources[0]?.count || 1;
                  const pct = Math.round((s.count / max) * 100);
                  return (
                    <div key={s.source}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize">{s.source || "direct"}</span>
                        <span className="text-muted-foreground">{s.count}</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Apparaten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-around gap-6 py-4">
                {devices.map((d) => (
                  <div key={d.type} className="text-center">
                    {d.type === "mobile" ? (
                      <Smartphone className="h-8 w-8 mx-auto text-blue-400" />
                    ) : d.type === "tablet" ? (
                      <Smartphone className="h-8 w-8 mx-auto text-amber-400" />
                    ) : (
                      <Monitor className="h-8 w-8 mx-auto text-violet-400" />
                    )}
                    <p className="text-lg font-bold mt-1">{d.count}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{d.type || "other"}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <p className="text-xl font-bold mt-1">{value}</p>
        <p className="text-[13px] text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
