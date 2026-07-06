"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Eye, MousePointerClick, Target, DollarSign, BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface CampaignData {
  campaign: { id: string; name: string; status: string; advertisingChannelType: string };
  metrics: { impressions?: number; clicks?: number; costMicros?: number; conversions?: number; ctr?: number; averageCpc?: number; conversionsValue?: number };
}

interface AdAccount { id: string; label: string; }

export function AdsOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [accountName, setAccountName] = useState("");

  useEffect(() => { fetchData(selectedAccount); }, [selectedAccount]);

  async function fetchData(accountId: string) {
    setLoading(true);
    setError("");
    try {
      const url = accountId ? `/api/ads/campaigns?accountId=${accountId}` : "/api/ads/campaigns";
      const res = await fetch(url);
      if (!res.ok) { const d = await res.json(); setError(d.details || d.error); return; }
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setAccounts(data.accounts || []);
      if (!selectedAccount && data.accountId) setSelectedAccount(data.accountId);
      if (data.account?.customer?.descriptiveName) setAccountName(data.account.customer.descriptiveName);
    } catch { setError("Verbindingsfout"); }
    finally { setLoading(false); }
  }

  const totals = campaigns.reduce((a, c) => ({
    impressions: a.impressions + (c.metrics.impressions || 0),
    clicks: a.clicks + (c.metrics.clicks || 0),
    cost: a.cost + (c.metrics.costMicros || 0) / 1_000_000,
    conversions: a.conversions + (c.metrics.conversions || 0),
    convValue: a.convValue + (c.metrics.conversionsValue || 0),
  }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, convValue: 0 });

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const roas = totals.cost > 0 ? totals.convValue / totals.cost : 0;
  const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;

  const kpis = [
    { label: "Impressies", value: totals.impressions >= 1000 ? `${(totals.impressions/1000).toFixed(1)}K` : totals.impressions, icon: Eye, color: "from-blue-500/20 to-cyan-500/5", iconBg: "bg-blue-500/10 text-blue-400" },
    { label: "Clicks", value: totals.clicks.toLocaleString(), icon: MousePointerClick, color: "from-violet-500/20 to-purple-500/5", iconBg: "bg-violet-500/10 text-violet-400" },
    { label: "CTR", value: `${ctr.toFixed(1)}%`, icon: Target, color: "from-emerald-500/20 to-teal-500/5", iconBg: "bg-emerald-500/10 text-emerald-400" },
    { label: "Kosten", value: `€${totals.cost.toFixed(0)}`, icon: DollarSign, color: "from-amber-500/20 to-orange-500/5", iconBg: "bg-amber-500/10 text-amber-400" },
    { label: "Conversies", value: totals.conversions, icon: TrendingUp, color: "from-rose-500/20 to-pink-500/5", iconBg: "bg-rose-500/10 text-rose-400" },
    { label: "ROAS", value: `${roas.toFixed(1)}x`, icon: Zap, color: "from-cyan-500/20 to-blue-500/5", iconBg: "bg-cyan-500/10 text-cyan-400" },
  ];

  if (loading) return (
    <Card className="border-border overflow-hidden">
      <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /></CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </CardContent>
    </Card>
  );

  if (error) return (
    <Card className="border-border bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-amber-400" /> Google Ads
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {error.includes("DEVELOPER_TOKEN") || error.includes("NOT_ACTIVATED")
            ? "Google Ads API — in afwachting van goedkeuring Developer Token"
            : "Verbinding tijdelijk niet beschikbaar — Developer Token in review"}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <Card className="border-border overflow-hidden bg-gradient-to-br from-card via-card to-slate-500/5 dark:to-slate-500/5">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-blue-500/20">
            <BarChart3 className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Google Ads</CardTitle>
            {accountName && <p className="text-xs text-muted-foreground">{accountName}</p>}
          </div>
        </div>
        {accounts.length > 1 && (
          <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
            className="text-xs bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.label}
              className={cn(
                "relative overflow-hidden rounded-xl border border-border/50 p-3.5 transition-all duration-200 hover:border-border hover:shadow-md hover:-translate-y-0.5",
                "bg-gradient-to-br", kpi.color
              )}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg", kpi.iconBg)}>
                  <kpi.icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className="text-lg font-bold tracking-tight">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Campaign table */}
        {campaigns.length > 0 && (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 border-b border-border/50 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-medium">Campagnes ({campaigns.length})</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/10">
                  <th className="py-2.5 px-4 font-medium">Campagne</th>
                  <th className="py-2.5 px-3 font-medium text-right">Impressies</th>
                  <th className="py-2.5 px-3 font-medium text-right">Clicks</th>
                  <th className="py-2.5 px-3 font-medium text-right">CTR</th>
                  <th className="py-2.5 px-3 font-medium text-right">CPC</th>
                  <th className="py-2.5 px-3 font-medium text-right">Kosten</th>
                  <th className="py-2.5 px-3 font-medium text-right">Conv.</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <tr key={c.campaign.id}
                    className={cn(
                      "border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors",
                      i % 2 === 0 && "bg-muted/5"
                    )}>
                    <td className="py-2.5 px-4 font-medium text-xs truncate max-w-[180px]">{c.campaign.name}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{(c.metrics.impressions||0).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-xs text-right">{c.metrics.clicks||0}</td>
                    <td className="py-2.5 px-3 text-xs text-right">{((c.metrics.ctr||0)*100).toFixed(1)}%</td>
                    <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">€{((c.metrics.averageCpc||0)/1_000_000).toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-xs text-right font-medium">€{((c.metrics.costMicros||0)/1_000_000).toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-xs text-right">{c.metrics.conversions||0}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant={c.campaign.status==="ENABLED"?"default":"secondary"}
                        className={cn("text-[10px] px-1.5 py-0", c.campaign.status==="ENABLED" && "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")}>
                        {c.campaign.status==="ENABLED"?"Actief":"Pauze"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
