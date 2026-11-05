"use client";

// ─── Bavian-parity inventory sections ───
// Campagnes: full campaign inventory + impression-share chart (won / lost to
// rank / lost to budget). Keywords: full keyword table with pause action.
// Negatieven: every negative on the account, with a human-gated unblock.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, PauseCircle, Unlock, Search as SearchIcon } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { eur } from "./search-terms-section";
import { num } from "@/lib/format";

const ACCOUNT_ID = "668-709-2345";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

// ─── Campagnes ───

interface CampaignRow {
  campaignId: string;
  name: string;
  status: string;
  channelType: string;
  biddingStrategy: string;
  dailyBudgetMicros: number;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
}

interface ISPoint {
  date: string;
  share: number | null;
  lostRank: number | null;
  lostBudget: number | null;
}

const CHANNEL_LABEL: Record<string, string> = {
  SEARCH: "Search",
  PERFORMANCE_MAX: "PMax",
  DISPLAY: "Display",
  VIDEO: "Video",
  DEMAND_GEN: "Demand Gen",
  SHOPPING: "Shopping",
  LOCAL_SERVICES: "Local Services",
  MULTI_CHANNEL: "Multi",
  SMART: "Smart",
};

export function CampaignsSection({ dateRange }: { dateRange: string }) {
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [isSeries, setIsSeries] = useState<ISPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ALL">("ACTIVE");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/ads/inventory?accountId=${ACCOUNT_ID}&dateRange=${dateRange}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setCampaigns(data.campaigns ?? []);
      setIsSeries(data.impressionShare ?? []);
    } catch (e) {
      setError(String(e));
      setCampaigns([]);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const latest = isSeries?.length ? isSeries[isSeries.length - 1] : null;
  const isChartData = (isSeries ?? []).map((d) => ({
    date: d.date.slice(5),
    Gewonnen: d.share !== null ? +(d.share * 100).toFixed(1) : null,
    "Verloren (rank)": d.lostRank !== null ? +(d.lostRank * 100).toFixed(1) : null,
    "Verloren (budget)": d.lostBudget !== null ? +(d.lostBudget * 100).toFixed(1) : null,
  }));

  const visible = (campaigns ?? []).filter((c) =>
    statusFilter === "ACTIVE" ? c.status === "ENABLED" : true
  );

  return (
    <div className="space-y-4">
      {/* Impression share — whose auction are we winning? (Search only:
          Google publishes no IS for PMax.) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Impression share — Search campagnes</CardTitle>
        </CardHeader>
        <CardContent>
          {!isSeries ? (
            <Skeleton className="h-56 w-full" />
          ) : !isSeries.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Geen impression-share data in deze periode.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-xl font-bold text-emerald-400">{pct(latest?.share ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Impression share (gewonnen)</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xl font-bold text-amber-400">{pct(latest?.lostRank ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Verloren door rank (advertentierang)</p>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <p className="text-xl font-bold text-red-400">{pct(latest?.lostBudget ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Verloren door budget</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={isChartData} stackOffset="expand">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(value) => `${Number(value).toFixed(1)}%`}
                  />
                  <Area type="monotone" dataKey="Gewonnen" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="Verloren (rank)" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
                  <Area type="monotone" dataKey="Verloren (budget)" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Indruk-gewogen gemiddelde over actieve Search campagnes. &quot;Verloren door budget&quot; hoog =
                budget verhogen loont; &quot;verloren door rank&quot; hoog = advertentiekwaliteit/bod is het probleem.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Campaign inventory */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">
              Campagnes ({visible.length}{statusFilter === "ACTIVE" && campaigns ? ` actief · ${campaigns.length} totaal` : ""})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Metrics over {dateRange === "LAST_7_DAYS" ? "7" : "30"} dagen · account 668-709-2345
            </p>
          </div>
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(["ACTIVE", "ALL"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 ${statusFilter === f ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted/40"}`}
              >
                {f === "ACTIVE" ? "Actief" : "Alles"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-red-400 py-2">{error}</p>
          )}
          {!campaigns ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !campaigns.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Geen campagnes gevonden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Campagne</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Bieding</th>
                    <th className="py-2 pr-3 text-right">Budget/dag</th>
                    <th className="py-2 pr-3 text-right">Spend</th>
                    <th className="py-2 pr-3 text-right">Kliks</th>
                    <th className="py-2 pr-3 text-right">CTR</th>
                    <th className="py-2 pr-3 text-right">Conv.</th>
                    <th className="py-2 pr-3 text-right">CPA</th>
                    <th className="py-2 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.campaignId} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 pr-3 font-medium max-w-72 truncate" title={c.name}>{c.name}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {CHANNEL_LABEL[c.channelType] ?? c.channelType}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge className={c.status === "ENABLED"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground border-border"}>
                          {c.status === "ENABLED" ? "Actief" : c.status === "PAUSED" ? "Gepauzeerd" : c.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{c.biddingStrategy.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="py-2 pr-3 text-right">{c.dailyBudgetMicros > 0 ? eur(c.dailyBudgetMicros) : "—"}</td>
                      <td className="py-2 pr-3 text-right font-medium">{eur(c.costMicros)}</td>
                      <td className="py-2 pr-3 text-right">{c.clicks.toLocaleString("nl-BE")}</td>
                      <td className="py-2 pr-3 text-right">{c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(1)}%` : "—"}</td>
                      <td className="py-2 pr-3 text-right">{num(c.conversions)}</td>
                      <td className="py-2 pr-3 text-right">{c.conversions > 0 ? eur(c.costMicros / c.conversions) : "—"}</td>
                      <td className="py-2 text-right" title={c.costMicros > 0 && c.conversionsValue === 0 ? "€0 conversiewaarde gemeten — of waardetracking staat uit" : undefined}>
                        {c.costMicros > 0 ? (c.conversionsValue / (c.costMicros / 1_000_000)).toFixed(1).replace(".", ",") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Keywords (full table) ───

export interface FullKeywordRow {
  resourceName: string;
  text: string;
  matchType: string;
  status: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  cpa: number | null;
  flag: "pause_candidate" | "ok";
  reason: string;
}

export function KeywordsSection({
  keywords,
  loading,
  busy,
  onPause,
}: {
  keywords: FullKeywordRow[] | null;
  loading: boolean;
  busy: string | null;
  onPause: (k: FullKeywordRow) => void;
}) {
  const [filter, setFilter] = useState("");

  const rows = (keywords ?? []).filter((k) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      k.text.toLowerCase().includes(q) ||
      k.campaignName.toLowerCase().includes(q) ||
      k.adGroupName.toLowerCase().includes(q)
    );
  });

  function downloadCsv() {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Keyword", "Match", "Status", "Campagne", "Adgroep", "Kliks", "Vertoningen", "CTR %", "Kosten", "Gem. CPC", "Conversies", "CPA"];
    const lines = rows.map((k) => [
      k.text, k.matchType, k.status, k.campaignName, k.adGroupName,
      k.clicks, k.impressions,
      k.impressions > 0 ? ((k.clicks / k.impressions) * 100).toFixed(2) : "0",
      (k.costMicros / 1_000_000).toFixed(2),
      k.clicks > 0 ? (k.costMicros / 1_000_000 / k.clicks).toFixed(2) : "0",
      k.conversions,
      k.cpa !== null ? (k.cpa / 1_000_000).toFixed(2) : "",
    ].map(esc).join(";"));
    const blob = new Blob(["﻿" + [header.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `keywords-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <SearchIcon className="h-5 w-5 text-brand" /> Alle keywords ({rows.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Zoek keyword, campagne…"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm w-64"
          />
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Geen keywords gevonden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Keyword</th>
                  <th className="py-2 pr-3">Match</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Campagne / Adgroep</th>
                  <th className="py-2 pr-3 text-right">Kliks</th>
                  <th className="py-2 pr-3 text-right">Impr.</th>
                  <th className="py-2 pr-3 text-right">CTR</th>
                  <th className="py-2 pr-3 text-right">Kosten</th>
                  <th className="py-2 pr-3 text-right">CPC</th>
                  <th className="py-2 pr-3 text-right">Conv.</th>
                  <th className="py-2 pr-3 text-right">CPA</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((k) => (
                  <tr key={k.resourceName} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 pr-3 font-medium max-w-56 truncate" title={k.text}>{k.text}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{k.matchType}</td>
                    <td className="py-2 pr-3">
                      <Badge className={k.status === "ENABLED"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-muted/40 text-muted-foreground border-border"}>
                        {k.status === "ENABLED" ? "Actief" : k.status === "PAUSED" ? "Gepauzeerd" : k.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground max-w-48">
                      <div className="truncate" title={k.campaignName}>{k.campaignName}</div>
                      <div className="truncate text-muted-foreground/60" title={k.adGroupName}>{k.adGroupName}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">{k.clicks}</td>
                    <td className="py-2 pr-3 text-right">{k.impressions.toLocaleString("nl-BE")}</td>
                    <td className="py-2 pr-3 text-right">{k.impressions > 0 ? `${((k.clicks / k.impressions) * 100).toFixed(1)}%` : "—"}</td>
                    <td className="py-2 pr-3 text-right font-medium">{eur(k.costMicros)}</td>
                    <td className="py-2 pr-3 text-right">{k.clicks > 0 ? eur(k.costMicros / k.clicks) : "—"}</td>
                    <td className="py-2 pr-3 text-right">{k.conversions}</td>
                    <td className="py-2 pr-3 text-right">{k.cpa !== null ? eur(k.cpa) : "—"}</td>
                    <td className="py-2 text-right">
                      {k.status === "ENABLED" && (
                        <Button
                          size="sm" variant="outline"
                          disabled={busy === `kw:${k.resourceName}`}
                          onClick={() => onPause(k)}
                          title={k.flag === "pause_candidate" ? k.reason : "Pauzeer dit keyword"}
                        >
                          <PauseCircle className={`h-3.5 w-3.5 mr-1 ${k.flag === "pause_candidate" ? "text-amber-400" : ""}`} />
                          {busy === `kw:${k.resourceName}` ? "…" : "Pauzeer"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                Top 300 getoond — gebruik het zoekveld of download de CSV voor alles ({rows.length} rijen).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Negatieve keywords ───

interface NegativeRow {
  scope: "campaign" | "shared";
  resourceName: string;
  text: string;
  matchType: string;
  container: string;
  affectedCampaigns: string[];
}

const MATCH_EXPLAIN: Record<string, string> = {
  BROAD: "Blokkeert alle zoekopdrachten met deze woorden (elke volgorde)",
  PHRASE: "Blokkeert zoekopdrachten die deze woordgroep bevatten",
  EXACT: "Blokkeert alleen deze exacte zoekopdracht",
};

export function NegativesSection({
  onUnblock,
  busy,
}: {
  onUnblock: (n: NegativeRow) => void;
  busy: string | null;
}) {
  const [negatives, setNegatives] = useState<NegativeRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/ads/negatives?accountId=${ACCOUNT_ID}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.details || data.error);
        setNegatives(data.negatives ?? []);
      } catch (e) {
        setError(String(e));
        setNegatives([]);
      }
    })();
  }, [reloadKey]);

  // The parent re-fetches after a mutation; expose a reload trigger via busy
  // going back to null after a successful unblock.
  useEffect(() => {
    if (busy === null && negatives !== null) setReloadKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const rows = (negatives ?? []).filter((n) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return n.text.toLowerCase().includes(q) || n.container.toLowerCase().includes(q);
  });

  const sharedCount = (negatives ?? []).filter((n) => n.scope === "shared").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">Negatieve keywords ({negatives?.length ?? 0})</CardTitle>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Zoek negatief keyword…"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm w-64"
        />
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {sharedCount > 0 && `${sharedCount} via gedeelde lijsten (gelden voor alle gekoppelde campagnes). `}
          &quot;Deblokkeer&quot; verwijdert het negatief — de zoekterm mag dan weer je advertenties tonen.
        </p>
        {error && <p className="text-sm text-red-400 py-2">{error}</p>}
        {!negatives ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Geen negatieve keywords gevonden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Keyword</th>
                  <th className="py-2 pr-3">Match</th>
                  <th className="py-2 pr-3">Bereik</th>
                  <th className="py-2 pr-3">Geldt voor</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((n) => (
                  <tr key={n.resourceName} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 pr-3 font-medium">{n.text}</td>
                    <td className="py-2 pr-3 text-xs" title={MATCH_EXPLAIN[n.matchType] ?? ""}>
                      {n.matchType}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge className={n.scope === "shared"
                        ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                        : "bg-muted/40 text-muted-foreground border-border"}>
                        {n.scope === "shared" ? "Gedeelde lijst" : "Campagne"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground max-w-64">
                      {n.scope === "shared" ? (
                        <span title={n.affectedCampaigns.join(", ")}>
                          {n.container}
                          {n.affectedCampaigns.length > 0 && ` · ${n.affectedCampaigns.length} campagnes`}
                        </span>
                      ) : (
                        n.container
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm" variant="outline"
                        disabled={busy === `neg:${n.resourceName}`}
                        onClick={() => onUnblock(n)}
                        title={n.scope === "shared"
                          ? `Verwijdert "${n.text}" uit lijst "${n.container}" — geldt dan voor géén enkele gekoppelde campagne meer`
                          : `Verwijdert de blokkade van "${n.text}" in ${n.container}`}
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1" />
                        {busy === `neg:${n.resourceName}` ? "…" : "Deblokkeer"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                Top 300 getoond — gebruik het zoekveld ({rows.length} rijen totaal).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
