"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Users, ShoppingCart, CreditCard, TrendingUp,
  Globe, Monitor, Smartphone, Tablet, Clock, MapPin,
  Layers, ArrowRightLeft, Funnel, BarChart3, Package,
} from "lucide-react";

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════
interface LivePresence {
  liveVisitors: number; activeSessions: number;
  activeCarts: number; activeCheckouts: number; recentOrders: number;
  liveSessions: LiveSession[];
}
interface LiveSession {
  id: string; visitorId: string; country: string | null; city: string | null;
  deviceType: string | null; source: string | null; landingPage: string | null;
  pageViews: number; startedAt: string; campaign?: string | null;
}
interface AnalyticsStats {
  overview: {
    totalEvents: number; todayEvents: number; yesterdayEvents: number;
    totalSessions: number; todaySessions: number; weekSessions: number;
    activeSessions: number; todayPurchases: number; todayRevenue: number;
    weekPurchases: number; weekRevenue: number; weekVisitors: number;
  };
  topPages: { path: string; title: string; views: number }[];
  deviceBreakdown: { type: string; count: number }[];
  sourceBreakdown: { source: string; count: number }[];
  countryBreakdown: { country: string; count: number }[];
  lastEvent: { at: string; type: string } | null; status: string;
}
interface FunnelData {
  funnel: { step: string; label: string; sessions: number; conversionRate: number; dropOff: number }[];
  overallConversionRate: number;
  productConversion: { productId: string; productName: string; views: number; addToCarts: number; conversionRate: number }[];
}

const DEVICE_ICONS: Record<string, React.ElementType> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };
const FUNNEL_COLORS = ["bg-blue-500", "bg-amber-500", "bg-violet-500", "bg-emerald-500"];
const FUNNEL_ICONS = [Eye, ShoppingCart, CreditCard, TrendingUp];

// ═══════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════
export default function AnalyticsPage() {
  const [live, setLive] = useState<LivePresence | null>(null);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState<Date>(new Date());
  const liveInterval = useRef<NodeJS.Timeout | null>(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/live");
      if (res.ok) { setLive(await res.json()); setSince(new Date()); }
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  const fetchFunnel = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/funnel?days=30");
      if (res.ok) setFunnel(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchLive(); fetchStats(); fetchFunnel();
    liveInterval.current = setInterval(fetchLive, 8000);
    return () => { if (liveInterval.current) clearInterval(liveInterval.current); };
  }, [fetchLive, fetchStats, fetchFunnel]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(n);
  const formatNumber = (n: number) => new Intl.NumberFormat("nl-BE").format(n);
  const timeSince = since ? Math.floor((Date.now() - since.getTime()) / 1000) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm">Live tracking & inzichten voor quicksolutionspro.be</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live • {timeSince}s
        </div>
      </div>

      {/* Live Counter Cards (always visible) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <LiveCard title="Live Bezoekers" value={live?.liveVisitors ?? 0} icon={Users} color="text-emerald-400" bg="bg-emerald-500/10" ring="ring-emerald-500/20" />
        <LiveCard title="Actieve Sessies" value={live?.activeSessions ?? 0} icon={Activity} color="text-blue-400" bg="bg-blue-500/10" ring="ring-blue-500/20" />
        <LiveCard title="Winkelwagens" value={live?.activeCarts ?? 0} icon={ShoppingCart} color="text-amber-400" bg="bg-amber-500/10" ring="ring-amber-500/20" />
        <LiveCard title="Checkouts" value={live?.activeCheckouts ?? 0} icon={CreditCard} color="text-violet-400" bg="bg-violet-500/10" ring="ring-violet-500/20" />
        <LiveCard title="Orders (60m)" value={live?.recentOrders ?? 0} icon={TrendingUp} color="text-rose-400" bg="bg-rose-500/10" ring="ring-rose-500/20" />
      </div>

      {/* Today Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Vandaag Pageviews" value={formatNumber(stats.overview.todayEvents)} sub={`${stats.overview.yesterdayEvents} gisteren`} href="/dashboard/analytics" />
          <StatCard label="Vandaag Sessies" value={formatNumber(stats.overview.todaySessions)} sub={`${formatNumber(stats.overview.weekSessions)} deze week`} href="/dashboard/analytics" />
          <StatCard label="Vandaag Orders" value={formatNumber(stats.overview.todayPurchases)} sub={`${formatCurrency(stats.overview.todayRevenue)} omzet`} href="/dashboard/bestellingen?filter=today" />
          <StatCard label="Week Bezoekers" value={formatNumber(stats.overview.weekVisitors)} sub={`${formatCurrency(stats.overview.weekRevenue)} week omzet`} href="/dashboard/bestellingen?filter=week" />
        </div>
      )}

      {/* ═══ LIVE ═══ */}
      <section className="mt-6 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-400" /> Live Bezoekers
                  <Badge variant="secondary" className="text-[10px] ml-auto">{live?.liveSessions.length ?? 0} online</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {live?.liveSessions && live.liveSessions.length > 0 ? (
                  <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                    {live.liveSessions.map((s) => {
                      const DeviceIcon = DEVICE_ICONS[s.deviceType || ""] || Monitor;
                      return (
                        <Link key={s.id} href={`/dashboard/analytics/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium truncate">{s.city || s.country || "Onbekend"}</span>
                              <DeviceIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{s.landingPage || "/"}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {s.source && <Badge variant="outline" className="text-[9px] py-0 h-4">{s.source}</Badge>}
                            <span className="text-[10px] text-muted-foreground w-16 text-right">{getTimeAgo(s.startedAt)} • {s.pageViews}pv</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">Geen live bezoekers</p>
                    <p className="text-xs">Bezoekers verschijnen hier zodra ze actief zijn</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {stats && stats.deviceBreakdown.length > 0 && (
                <BreakdownCard title="Apparaten" icon={Monitor} items={stats.deviceBreakdown.map(d => ({ label: d.type || "onbekend", value: d.count }))} />
              )}
              {stats && stats.countryBreakdown.length > 0 && (
                <BreakdownCard title="Landen" icon={Globe} items={stats.countryBreakdown.slice(0, 8).map(c => ({ label: c.country || "onbekend", value: c.count }))} />
              )}
              {stats && stats.sourceBreakdown.length > 0 && (
                <BreakdownCard title="Verkeersbronnen" icon={ArrowRightLeft} items={stats.sourceBreakdown.map(s => ({ label: s.source || "direct", value: s.count }))} />
              )}
            </div>
          </div>

          {stats && stats.topPages.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Layers className="h-4 w-4" /> Top Pagina's Vandaag</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {stats.topPages.map((p, i) => (
                    <div key={p.path} className="flex items-center gap-3 text-xs py-1.5 hover:bg-muted/40 rounded px-2 transition-colors">
                      <span className="w-5 text-muted-foreground font-mono">{i + 1}</span>
                      <span className="flex-1 truncate font-medium">{p.path}</span>
                      <span className="text-muted-foreground shrink-0">{p.views} views</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
      </section>

      {/* ═══ FUNNEL ═══ */}
      <section className="mt-8 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Funnel className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Conversie Funnel</h2>
        </div>
          {funnel ? (
            <>
              {/* Funnel viz */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Funnel className="h-4 w-4" /> Conversie Funnel (30 dagen)
                    <Badge variant="secondary" className="text-[10px] ml-auto">{funnel.overallConversionRate}% conversie</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {funnel.funnel.map((step, i) => {
                      const pct = step.sessions > 0 ? Math.max((step.sessions / (funnel.funnel[0]?.sessions || 1)) * 100, 2) : 2;
                      const StepIcon = FUNNEL_ICONS[i];
                      return (
                        <div key={step.step}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-1.5 font-medium">
                              <StepIcon className="h-3.5 w-3.5 text-muted-foreground" /> {step.label}
                            </span>
                            <span className="text-muted-foreground">
                              {step.sessions} sessies • {step.conversionRate}% • {step.dropOff > 0 ? `${step.dropOff}% drop` : ""}
                            </span>
                          </div>
                          <div className="h-7 w-full bg-muted rounded-md overflow-hidden">
                            <div
                              className={`h-full ${FUNNEL_COLORS[i]} rounded-md transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Product Conversion */}
              {funnel.productConversion.length > 0 && (
                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4" /> Product Conversie (30 dagen)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                      {funnel.productConversion.slice(0, 15).map((p) => (
                        <div key={p.productId} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.productName}</p>
                            <p className="text-[11px] text-muted-foreground">{p.views} views • {p.addToCarts} in winkelwagen</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold">{p.conversionRate}%</p>
                            <p className="text-[10px] text-muted-foreground">conversie</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground text-sm">Nog geen funnel data beschikbaar.</CardContent></Card>
          )}
      </section>

      {/* ═══ PRODUCTS ═══ */}
      <section className="mt-8 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Package className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">Product Prestaties</h2>
        </div>
          {funnel?.productConversion && funnel.productConversion.length > 0 ? (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Product Prestaties
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {funnel.productConversion.map((p) => (
                    <div key={p.productId} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <span className="text-xs text-muted-foreground font-mono w-20 truncate">{p.productId}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.productName}</p>
                        <div className="flex gap-3 mt-0.5 text-[11px] text-muted-foreground">
                          <span>{p.views} views</span>
                          <span>{p.addToCarts} winkelwagen</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold">{p.conversionRate}%</span>
                          <span className="text-[10px] text-muted-foreground">conv.</span>
                        </div>
                        {/* mini progress bar */}
                        <div className="h-1 w-16 bg-muted rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(p.conversionRate, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border"><CardContent className="py-12 text-center text-muted-foreground text-sm">Nog geen product data beschikbaar.</CardContent></Card>
          )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════

function LiveCard({ title, value, icon: Icon, color, bg, ring }: {
  title: string; value: number; icon: React.ElementType; color: string; bg: string; ring: string;
}) {
  return (
    <Card className={`border-border ${ring} ring-1`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{title}</span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
        </div>
        <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const content = (
    <Card className="border-border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:border-brand/30 cursor-pointer">
      <CardContent className="p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className="text-xl font-bold mt-1">{value}</p>
        <p className="text-[13px] text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href} className="block">{content}</Link>;
  return content;
}

function BreakdownCard({ title, icon: Icon, items }: {
  title: string; icon: React.ElementType; items: { label: string; value: number }[];
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Icon className="h-4 w-4" /> {title}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground capitalize">{item.label}</span>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getTimeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}u`;
}

// Need this for the funnel tab icon
function Eye(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
