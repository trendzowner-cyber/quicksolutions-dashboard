"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Eye, MousePointerClick, Target, DollarSign, Zap, BarChart3, RotateCw, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const CHANNEL_LABELS: Record<string, string> = { SHOPPING: "Shopping", PERFORMANCE_MAX: "P.Max", SEARCH: "Search", DISPLAY: "Display", VIDEO: "Video" };
const DATE_RANGES = [
  { value: "TODAY", label: "Vandaag" }, { value: "YESTERDAY", label: "Gisteren" },
  { value: "LAST_7_DAYS", label: "7 dagen" }, { value: "LAST_30_DAYS", label: "30 dagen" },
  { value: "THIS_MONTH", label: "Deze maand" }, { value: "LAST_MONTH", label: "Vorige maand" },
  { value: "", label: "Alles" },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
function eur(n: number): string { return "€" + fmt(n); }
function pct(n: number): string { return (n * 100).toFixed(1) + "%"; }
function eurCents(n: number): string {
  if (n >= 1_000_000) return "€" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "€" + (n / 1_000).toFixed(0);
  return "€" + n.toFixed(2);
}

export function AdsOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string; channel: string; impressions: number; clicks: number; costMicros: number; conversions: number; ctr: number; averageCpc: number; conversionsValue: number }>>([]);
  const [totals, setTotals] = useState<Record<string,number>>({});
  const [accounts, setAccounts] = useState<Array<{id:string;label:string}>>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [dateRange, setDateRange] = useState("LAST_30_DAYS");

  function fetchData(accountId: string, dr: string) {
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (dr) params.set("dateRange", dr);
    fetch(`/api/ads/campaigns?${params}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setError(d.details || d.error); return; }
        setCampaigns(d.campaigns || []);
        setTotals(d.totals || {});
        setAccounts(d.accounts || []);
        setAccountName(d.accountName || "");
        if (!selectedAccount && d.accountId) setSelectedAccount(d.accountId);
      })
      .catch(() => setError("Verbindingsfout"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(selectedAccount, dateRange); }, [selectedAccount, dateRange]);

  const cost = (totals.costMicros || 0) / 1_000_000;
  const roas = cost > 0 ? (totals.conversionsValue || 0) / cost : 0;
  const cpc = (totals.clicks || 0) > 0 ? cost / totals.clicks : 0;

  const kpis = [
    { label: "Impressies", value: fmt(totals.impressions||0), icon: Eye, color: "from-blue-500/20 to-cyan-500/5", iconBg: "bg-blue-500/10 text-blue-400" },
    { label: "Clicks", value: fmt(totals.clicks||0), icon: MousePointerClick, color: "from-violet-500/20 to-purple-500/5", iconBg: "bg-violet-500/10 text-violet-400" },
    { label: "CTR", value: pct(totals.ctr||0), icon: Target, color: "from-emerald-500/20 to-teal-500/5", iconBg: "bg-emerald-500/10 text-emerald-400" },
    { label: "Kosten", value: eur(cost), icon: DollarSign, color: "from-amber-500/20 to-orange-500/5", iconBg: "bg-amber-500/10 text-amber-400" },
    { label: "Conversies", value: fmt(totals.conversions||0), icon: TrendingUp, color: "from-rose-500/20 to-pink-500/5", iconBg: "bg-rose-500/10 text-rose-400" },
    { label: "ROAS", value: roas > 0 ? roas.toFixed(1) + "x" : "—", icon: Zap, color: "from-cyan-500/20 to-blue-500/5", iconBg: "bg-cyan-500/10 text-cyan-400" },
  ];

  if (loading) return (
    <Card className="border-border"><CardHeader><Skeleton className="h-5 w-32"/></CardHeader>
      <CardContent><div className="grid grid-cols-3 md:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-20 rounded-xl"/>)}</div></CardContent></Card>
  );

  if (error) return (
    <Card className="border-border bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-amber-400"/>Google Ads</CardTitle></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{error.length > 150 ? "Google Ads API tijdelijk niet beschikbaar" : error}</p>
      <button onClick={() => fetchData(selectedAccount, dateRange)} className="text-xs text-primary mt-2 flex items-center gap-1 hover:underline"><RotateCw className="h-3 w-3"/>Opnieuw proberen</button></CardContent></Card>
  );

  return (
    <Card className="border-border overflow-hidden bg-gradient-to-br from-card via-card to-slate-500/5">
      <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-blue-500/20">
            <BarChart3 className="h-4 w-4 text-blue-400"/>
          </div>
          <div>
            <CardTitle className="text-base">Google Ads</CardTitle>
            {accountName && <p className="text-xs text-muted-foreground">{accountName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Account switcher */}
          {accounts.length > 1 && (
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
              className="text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-muted-foreground cursor-pointer">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          )}
          {/* Date range */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg border border-border p-0.5">
            <Calendar className="h-3 w-3 text-muted-foreground ml-1.5"/>
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
              className="text-xs bg-transparent px-1.5 py-1 text-muted-foreground cursor-pointer outline-none">
              {DATE_RANGES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={cn("relative overflow-hidden rounded-xl border border-border/50 p-3.5 transition-all duration-200 hover:border-border hover:shadow-md hover:-translate-y-0.5","bg-gradient-to-br",kpi.color)}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg",kpi.iconBg)}><kpi.icon className="h-3.5 w-3.5"/></div>
              </div>
              <p className="text-lg font-bold tracking-tight">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Campaign table */}
        {campaigns.length > 0 && (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 border-b border-border/50 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>
              <span className="text-xs font-medium">Campagnes ({campaigns.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/10">
                    <th className="py-2.5 px-3 font-medium">Campagne</th>
                    <th className="py-2.5 px-2 font-medium text-right">Type</th>
                    <th className="py-2.5 px-2 font-medium text-right">Impr.</th>
                    <th className="py-2.5 px-2 font-medium text-right">Clicks</th>
                    <th className="py-2.5 px-2 font-medium text-right">CTR</th>
                    <th className="py-2.5 px-2 font-medium text-right">CPC</th>
                    <th className="py-2.5 px-2 font-medium text-right">Kosten</th>
                    <th className="py-2.5 px-2 font-medium text-right">Conv.</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 20).map((c, i) => {
                    const cCost = (c.costMicros || 0) / 1_000_000;
                    const cCpc = c.clicks > 0 ? cCost / c.clicks : 0;
                    return (
                      <tr key={c.id} className={cn("border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer", i % 2 === 0 && "bg-muted/5")}>
                        <td className="py-2.5 px-3 font-medium text-xs truncate max-w-[180px]">{c.name}</td>
                        <td className="py-2.5 px-2 text-[10px] text-right text-muted-foreground">{CHANNEL_LABELS[c.channel]||c.channel}</td>
                        <td className="py-2.5 px-2 text-xs text-right text-muted-foreground">{fmt(c.impressions)}</td>
                        <td className="py-2.5 px-2 text-xs text-right">{fmt(c.clicks)}</td>
                        <td className="py-2.5 px-2 text-xs text-right">{pct(c.ctr)}</td>
                        <td className="py-2.5 px-2 text-xs text-right text-muted-foreground">{eurCents(cCpc)}</td>
                        <td className="py-2.5 px-2 text-xs text-right font-medium">{eurCents(cCost)}</td>
                        <td className="py-2.5 px-2 text-xs text-right">{fmt(c.conversions)}</td>
                        <td className="py-2.5 px-3">
                          <Badge variant={c.status==="ENABLED"?"default":"secondary"}
                            className={cn("text-[10px] px-1.5 py-0",c.status==="ENABLED"&&"bg-emerald-500/10 text-emerald-400")}>
                            {c.status==="ENABLED"?"Actief":c.status==="PAUSED"?"Pauze":c.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
