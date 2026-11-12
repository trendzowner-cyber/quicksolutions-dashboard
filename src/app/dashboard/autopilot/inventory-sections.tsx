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
import { useAdsLang, type L } from "./i18n";

const IS_S = {
  isTitle: { nl: "Impression share — Search campagnes", en: "Impression share — Search campaigns" },
  noIsData: { nl: "Geen impression-share data in deze periode.", en: "No impression-share data in this period." },
  isWon: { nl: "Impression share (gewonnen)", en: "Impression share (won)" },
  lostRank: { nl: "Verloren door rank (advertentierang)", en: "Lost to rank (ad rank)" },
  lostBudget: { nl: "Verloren door budget", en: "Lost to budget" },
  isNote: { nl: "Indruk-gewogen gemiddelde over actieve Search campagnes. \"Verloren door budget\" hoog = budget verhogen loont; \"verloren door rank\" hoog = advertentiekwaliteit/bod is het probleem.", en: "Impression-weighted average over active Search campaigns. High \"lost to budget\" = raising the budget pays off; high \"lost to rank\" = ad quality/bid is the problem." },
  won: { nl: "Gewonnen", en: "Won" },
  lostRankShort: { nl: "Verloren (rank)", en: "Lost (rank)" },
  lostBudgetShort: { nl: "Verloren (budget)", en: "Lost (budget)" },
  metricsOver: { nl: "Metrics over", en: "Metrics over" },
  daysWord: { nl: "dagen", en: "days" },
  activeOf: { nl: "actief ·", en: "active ·" },
  totalWord: { nl: "totaal", en: "total" },
  activeF: { nl: "Actief", en: "Active" },
  allF: { nl: "Alles", en: "All" },
  noCampaigns: { nl: "Geen campagnes gevonden.", en: "No campaigns found." },
  colCampaign: { nl: "Campagne", en: "Campaign" },
  colType: { nl: "Type", en: "Type" },
  colStatus: { nl: "Status", en: "Status" },
  colBidding: { nl: "Bieding", en: "Bidding" },
  colBudgetDay: { nl: "Budget/dag", en: "Budget/day" },
  colClicks: { nl: "Kliks", en: "Clicks" },
  paused: { nl: "Gepauzeerd", en: "Paused" },
  roasTitle: { nl: "€0 conversiewaarde gemeten — of waardetracking staat uit", en: "€0 conversion value measured — or value tracking is off" },
  allKeywords: { nl: "Alle keywords", en: "All keywords" },
  searchKw: { nl: "Zoek keyword, campagne…", en: "Search keyword, campaign…" },
  noKeywords: { nl: "Geen keywords gevonden.", en: "No keywords found." },
  colMatch: { nl: "Match", en: "Match" },
  colCost: { nl: "Kosten", en: "Cost" },
  colAdgroup: { nl: "Campagne / Adgroep", en: "Campaign / Ad group" },
  pauseBtn: { nl: "Pauzeer", en: "Pause" },
  pauseTitleFlag: { nl: "Pauzeer dit keyword", en: "Pause this keyword" },
  pageOf: { nl: "Pagina", en: "Page" },
  ofWord: { nl: "van", en: "of" },
  prev: { nl: "‹ Vorige", en: "‹ Previous" },
  next: { nl: "Volgende ›", en: "Next ›" },
  bigKwList: { nl: "Grote lijst — gebruik het zoekveld of download de CSV", en: "Large list — use the search field or download the CSV" },
  rowsWord: { nl: "rijen", en: "rows" },
  excelTail: { nl: "om alles in Excel te zien.", en: "to see everything in Excel." },
  negTitle: { nl: "Negatieve keywords", en: "Negative keywords" },
  negSearch: { nl: "Zoek negatief keyword…", en: "Search negative keyword…" },
  negNote1: { nl: "via gedeelde lijsten (gelden voor alle gekoppelde campagnes).", en: "via shared lists (apply to all linked campaigns)." },
  negNote2: { nl: "\"Deblokkeer\" verwijdert het negatief — de zoekterm mag dan weer je advertenties tonen.", en: "\"Unblock\" removes the negative — the search term may show your ads again." },
  noNegatives: { nl: "Geen negatieve keywords gevonden.", en: "No negative keywords found." },
  colScope: { nl: "Bereik", en: "Scope" },
  colApplies: { nl: "Geldt voor", en: "Applies to" },
  sharedList: { nl: "Gedeelde lijst", en: "Shared list" },
  campaignScope: { nl: "Campagne", en: "Campaign" },
  campaignsWord: { nl: "campagnes", en: "campaigns" },
  unblock: { nl: "Deblokkeer", en: "Unblock" },
  unblockSharedTitle: { nl: "geldt dan voor géén enkele gekoppelde campagne meer", en: "it then applies to no linked campaign anymore" },
  unblockCampaignTitle1: { nl: "Verwijdert de blokkade van", en: "Removes the block on" },
  inWord: { nl: "in", en: "in" },
  matchBroad: { nl: "Blokkeert alle zoekopdrachten met deze woorden (elke volgorde)", en: "Blocks all searches containing these words (any order)" },
  matchPhrase: { nl: "Blokkeert zoekopdrachten die deze woordgroep bevatten", en: "Blocks searches containing this phrase" },
  matchExact: { nl: "Blokkeert alleen deze exacte zoekopdracht", en: "Blocks only this exact search" },
  csvTail: { nl: "Grote lijst — gebruik het zoekveld", en: "Large list — use the search field" },
} satisfies Record<string, L>;

const ACCOUNT_ID = "668-709-2345";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/** Shared table pager — shows prev/next + position, hidden for a single page. */
function TablePager({ page, total, onPage, lang }: { page: number; total: number; onPage: (p: number) => void; lang: "nl" | "en" }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-3">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>{IS_S.prev[lang]}</Button>
      <span className="px-2 text-xs text-muted-foreground">{IS_S.pageOf[lang]} {page + 1} {IS_S.ofWord[lang]} {total}</span>
      <Button size="sm" variant="outline" disabled={page >= total - 1} onClick={() => onPage(page + 1)}>{IS_S.next[lang]}</Button>
    </div>
  );
}

function usePager(count: number, perPage: number) {
  const [page, setPage] = useState(0);
  const total = Math.max(1, Math.ceil(count / perPage));
  const clamped = Math.min(page, total - 1);
  return {
    page: clamped,
    total,
    setPage,
    slice: <T,>(rows: T[]) => rows.slice(clamped * perPage, clamped * perPage + perPage),
  };
}

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
  const { lang } = useAdsLang();

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
  const wonLabel = IS_S.won[lang];
  const lostRankLabel = IS_S.lostRankShort[lang];
  const lostBudgetLabel = IS_S.lostBudgetShort[lang];
  const isChartData = (isSeries ?? []).map((d) => ({
    date: d.date.slice(5),
    [wonLabel]: d.share !== null ? +(d.share * 100).toFixed(1) : null,
    [lostRankLabel]: d.lostRank !== null ? +(d.lostRank * 100).toFixed(1) : null,
    [lostBudgetLabel]: d.lostBudget !== null ? +(d.lostBudget * 100).toFixed(1) : null,
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
          <CardTitle className="text-lg">{IS_S.isTitle[lang]}</CardTitle>
        </CardHeader>
        <CardContent>
          {!isSeries ? (
            <Skeleton className="h-56 w-full" />
          ) : !isSeries.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{IS_S.noIsData[lang]}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{pct(latest?.share ?? null)}</p>
                  <p className="text-xs text-muted-foreground">{IS_S.isWon[lang]}</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{pct(latest?.lostRank ?? null)}</p>
                  <p className="text-xs text-muted-foreground">{IS_S.lostRank[lang]}</p>
                </div>
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{pct(latest?.lostBudget ?? null)}</p>
                  <p className="text-xs text-muted-foreground">{IS_S.lostBudget[lang]}</p>
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
                  <Area type="monotone" dataKey={wonLabel} stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.5} />
                  <Area type="monotone" dataKey={lostRankLabel} stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
                  <Area type="monotone" dataKey={lostBudgetLabel} stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                {IS_S.isNote[lang]}
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
              {IS_S.colCampaign[lang]}s ({visible.length}{statusFilter === "ACTIVE" && campaigns ? ` ${IS_S.activeOf[lang]} ${campaigns.length} ${IS_S.totalWord[lang]}` : ""})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {IS_S.metricsOver[lang]} {dateRange === "LAST_7_DAYS" ? "7" : "30"} {IS_S.daysWord[lang]} · account 668-709-2345
            </p>
          </div>
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(["ACTIVE", "ALL"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 ${statusFilter === f ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted/40"}`}
              >
                {f === "ACTIVE" ? IS_S.activeF[lang] : IS_S.allF[lang]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>
          )}
          {!campaigns ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !campaigns.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{IS_S.noCampaigns[lang]}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">{IS_S.colCampaign[lang]}</th>
                    <th className="py-2 pr-3">{IS_S.colType[lang]}</th>
                    <th className="py-2 pr-3">{IS_S.colStatus[lang]}</th>
                    <th className="py-2 pr-3">{IS_S.colBidding[lang]}</th>
                    <th className="py-2 pr-3 text-right">{IS_S.colBudgetDay[lang]}</th>
                    <th className="py-2 pr-3 text-right">Spend</th>
                    <th className="py-2 pr-3 text-right">{IS_S.colClicks[lang]}</th>
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
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground border-border"}>
                          {c.status === "ENABLED" ? IS_S.activeF[lang] : c.status === "PAUSED" ? IS_S.paused[lang] : c.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{c.biddingStrategy.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="py-2 pr-3 text-right">{c.dailyBudgetMicros > 0 ? eur(c.dailyBudgetMicros) : "—"}</td>
                      <td className="py-2 pr-3 text-right font-medium">{eur(c.costMicros)}</td>
                      <td className="py-2 pr-3 text-right">{c.clicks.toLocaleString("nl-BE")}</td>
                      <td className="py-2 pr-3 text-right">{c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(1)}%` : "—"}</td>
                      <td className="py-2 pr-3 text-right">{num(c.conversions)}</td>
                      <td className="py-2 pr-3 text-right">{c.conversions > 0 ? eur(c.costMicros / c.conversions) : "—"}</td>
                      <td className="py-2 text-right" title={c.costMicros > 0 && c.conversionsValue === 0 ? IS_S.roasTitle[lang] : undefined}>
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
  const { lang } = useAdsLang();

  const rows = (keywords ?? []).filter((k) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      k.text.toLowerCase().includes(q) ||
      k.campaignName.toLowerCase().includes(q) ||
      k.adGroupName.toLowerCase().includes(q)
    );
  });

  const { page: kwPage, total: kwTotal, setPage: setKwPage, slice: kwSliceOf } = usePager(rows.length, 50);
  const kwSlice = kwSliceOf(rows);

  function downloadCsv() {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = lang === "en"
      ? ["Keyword", "Match", "Status", "Campaign", "Ad group", "Clicks", "Impressions", "CTR %", "Cost", "Avg. CPC", "Conversions", "CPA"]
      : ["Keyword", "Match", "Status", "Campagne", "Adgroep", "Kliks", "Vertoningen", "CTR %", "Kosten", "Gem. CPC", "Conversies", "CPA"];
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
          <SearchIcon className="h-5 w-5 text-brand" /> {IS_S.allKeywords[lang]} ({rows.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setKwPage(0); }}
            placeholder={IS_S.searchKw[lang]}
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
          <p className="text-sm text-muted-foreground py-6 text-center">{IS_S.noKeywords[lang]}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Keyword</th>
                  <th className="py-2 pr-3">{IS_S.colMatch[lang]}</th>
                  <th className="py-2 pr-3">{IS_S.colStatus[lang]}</th>
                  <th className="py-2 pr-3">{IS_S.colAdgroup[lang]}</th>
                  <th className="py-2 pr-3 text-right">{IS_S.colClicks[lang]}</th>
                  <th className="py-2 pr-3 text-right">Impr.</th>
                  <th className="py-2 pr-3 text-right">CTR</th>
                  <th className="py-2 pr-3 text-right">{IS_S.colCost[lang]}</th>
                  <th className="py-2 pr-3 text-right">CPC</th>
                  <th className="py-2 pr-3 text-right">Conv.</th>
                  <th className="py-2 pr-3 text-right">CPA</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {kwSlice.map((k) => (
                  <tr key={k.resourceName} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 pr-3 font-medium max-w-56 truncate" title={k.text}>{k.text}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{k.matchType}</td>
                    <td className="py-2 pr-3">
                      <Badge className={k.status === "ENABLED"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        : "bg-muted/40 text-muted-foreground border-border"}>
                        {k.status === "ENABLED" ? IS_S.activeF[lang] : k.status === "PAUSED" ? IS_S.paused[lang] : k.status}
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
                          title={k.flag === "pause_candidate" ? k.reason : IS_S.pauseTitleFlag[lang]}
                        >
                          <PauseCircle className={`h-3.5 w-3.5 mr-1 ${k.flag === "pause_candidate" ? "text-amber-600 dark:text-amber-400" : ""}`} />
                          {busy === `kw:${k.resourceName}` ? "…" : IS_S.pauseBtn[lang]}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePager page={kwPage} total={kwTotal} onPage={setKwPage} lang={lang} />
            {rows.length > 300 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                {IS_S.bigKwList[lang]} ({rows.length} {IS_S.rowsWord[lang]}) {IS_S.excelTail[lang]}
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

const MATCH_EXPLAIN: Record<string, L> = {
  BROAD: IS_S.matchBroad,
  PHRASE: IS_S.matchPhrase,
  EXACT: IS_S.matchExact,
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
  const { lang } = useAdsLang();

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

  const { page: negPage, total: negTotal, setPage: setNegPage, slice: negSliceOf } = usePager(rows.length, 50);
  const negSlice = negSliceOf(rows);

  const sharedCount = (negatives ?? []).filter((n) => n.scope === "shared").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">{IS_S.negTitle[lang]} ({negatives?.length ?? 0})</CardTitle>
        <input
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setNegPage(0); }}
          placeholder={IS_S.negSearch[lang]}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm w-64"
        />
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {sharedCount > 0 && `${sharedCount} ${IS_S.negNote1[lang]} `}
          {IS_S.negNote2[lang]}
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>}
        {!negatives ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{IS_S.noNegatives[lang]}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Keyword</th>
                  <th className="py-2 pr-3">{IS_S.colMatch[lang]}</th>
                  <th className="py-2 pr-3">{IS_S.colScope[lang]}</th>
                  <th className="py-2 pr-3">{IS_S.colApplies[lang]}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {negSlice.map((n) => (
                  <tr key={n.resourceName} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 pr-3 font-medium">{n.text}</td>
                    <td className="py-2 pr-3 text-xs" title={MATCH_EXPLAIN[n.matchType]?.[lang] ?? ""}>
                      {n.matchType}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge className={n.scope === "shared"
                        ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30"
                        : "bg-muted/40 text-muted-foreground border-border"}>
                        {n.scope === "shared" ? IS_S.sharedList[lang] : IS_S.campaignScope[lang]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground max-w-64">
                      {n.scope === "shared" ? (
                        <span title={n.affectedCampaigns.join(", ")}>
                          {n.container}
                          {n.affectedCampaigns.length > 0 && ` · ${n.affectedCampaigns.length} ${IS_S.campaignsWord[lang]}`}
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
                          ? (lang === "en" ? `Removes "${n.text}" from list "${n.container}" — ${IS_S.unblockSharedTitle.en}` : `Verwijdert "${n.text}" uit lijst "${n.container}" — ${IS_S.unblockSharedTitle.nl}`)
                          : `${IS_S.unblockCampaignTitle1[lang]} "${n.text}" ${IS_S.inWord[lang]} ${n.container}`}
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1" />
                        {busy === `neg:${n.resourceName}` ? "…" : IS_S.unblock[lang]}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePager page={negPage} total={negTotal} onPage={setNegPage} lang={lang} />
            {rows.length > 300 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                {IS_S.csvTail[lang]} ({rows.length} {IS_S.rowsWord[lang]}{lang === "en" ? " total" : " totaal"}).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
