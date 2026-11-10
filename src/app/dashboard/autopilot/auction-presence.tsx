"use client";

// ─── Auction presence (API-based daily domain tracking) ───
// Source: segments.auction_insight_domain via the Google Ads API (v23),
// synced daily into AuctionPresence. Presence only — Google gates rival
// metrics behind an allowlist, so this module never shows made-up shares.
// The CSV importer stays as a manual fallback for scopes the API misses.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Swords, Upload, RefreshCw, TrendingUp, TrendingDown, Info, X, Search as SearchIcon, Download } from "lucide-react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { dateShort } from "@/lib/format";

interface PresenceSummary {
  domain: string;
  firstSeen: string;
  lastSeen: string;
  daysSeen30: number;
  campaigns30: string[];
  presenceDates: string[];
  status: "new" | "expanding" | "steady" | "cooling";
  statusReason: string;
}

interface PresenceCoverage {
  coverageFrom: string | null;
  lastSyncAt: string | null;
  totalRows: number;
  note: string;
}

interface AuctionChange {
  kind: string;
  tone: "warning" | "good" | "info";
  title: string;
  detail: string;
}

interface DrilldownKeyword {
  text: string;
  matchType: string;
  adGroup: string;
  campaign: string;
  daysSeen: number;
  firstSeen: string;
  lastSeen: string;
}

interface DomainDrilldown {
  domain: string;
  windowStart: string;
  windowEnd: string;
  keywords: DrilldownKeyword[];
  note: string;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  new: { label: "Nieuw", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  expanding: { label: "Actiever", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  steady: { label: "Stabiel", cls: "bg-muted/40 text-muted-foreground border-border" },
  cooling: { label: "Afbouwend", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

const TONE_STYLE: Record<string, string> = {
  warning: "border-amber-500/30 bg-amber-500/5",
  good: "border-emerald-500/30 bg-emerald-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

// ─── Own impression-share stacked chart ───

interface SharePoint { date: string; share: number; lostRank: number; lostBudget: number }
type Granularity = "day" | "week" | "month";

const GRAN_LABEL: Record<Granularity, string> = { day: "Dag", week: "Week", month: "Maand" };

function bucketShare(points: SharePoint[], mode: Granularity) {
  const toPct = (p: SharePoint) => ({
    share: Math.round(p.share * 1000) / 10,
    lostRank: Math.round(p.lostRank * 1000) / 10,
    lostBudget: Math.round(p.lostBudget * 1000) / 10,
  });
  if (mode === "day") {
    return points.map((p) => ({ label: dateShort(p.date), ...toPct(p) }));
  }
  const groups = new Map<string, SharePoint[]>();
  for (const p of points) {
    let key: string;
    if (mode === "month") {
      key = p.date.slice(0, 7);
    } else {
      // ISO week → key on that week's Monday
      const d = new Date(p.date + "T00:00:00");
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
    }
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([key, arr]) => {
    const avg = (f: (p: SharePoint) => number) => arr.reduce((s, p) => s + f(p), 0) / arr.length;
    return {
      label: mode === "month"
        ? new Date(key + "-01T00:00:00").toLocaleDateString("nl-BE", { month: "short", year: "numeric" })
        : `w ${dateShort(key)}`,
      share: Math.round(avg((p) => p.share) * 1000) / 10,
      lostRank: Math.round(avg((p) => p.lostRank) * 1000) / 10,
      lostBudget: Math.round(avg((p) => p.lostBudget) * 1000) / 10,
    };
  });
}

function OwnShareCard() {
  const [series, setSeries] = useState<SharePoint[] | null>(null);
  const [gran, setGran] = useState<Granularity>("day");

  useEffect(() => {
    fetch("/api/ads/inventory")
      .then((r) => r.json())
      .then((d) => setSeries(d.impressionShare ?? []))
      .catch(() => setSeries([]));
  }, []);

  const data = series ? bucketShare(series, gran) : [];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-google" /> Jouw aandeel in de veiling
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Search impression share van je eigen account — hoeveel van de veilingen je wint,
            en hoeveel je verliest door rank (advertentierangschikking) of budget.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {(Object.keys(GRAN_LABEL) as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                gran === g ? "bg-google/15 text-google font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {GRAN_LABEL[g]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {series === null ? (
          <Skeleton className="h-56 w-full" />
        ) : !data.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Geen Search-campagnes met impression share in deze periode.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground"
                interval={Math.max(0, Math.floor(data.length / 12))} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} className="fill-muted-foreground"
                tickFormatter={(v) => `${v}%`} width={42} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="share" stackId="is" name="Vertoningen" fill="#10b981" />
              <Bar dataKey="lostRank" stackId="is" name="Verloren: rank" fill="#f59e0b" />
              <Bar dataKey="lostBudget" stackId="is" name="Verloren: budget" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function AuctionPresenceSection({ showToast }: { showToast: (m: string) => void }) {
  const [competitors, setCompetitors] = useState<PresenceSummary[] | null>(null);
  const [coverage, setCoverage] = useState<PresenceCoverage | null>(null);
  const [changes, setChanges] = useState<AuctionChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [pulledOn, setPulledOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);
  const [drilldown, setDrilldown] = useState<DomainDrilldown | null>(null);
  const [drillLoading, setDrillLoading] = useState<string | null>(null);
  const [drillSearch, setDrillSearch] = useState("");
  const [drillShown, setDrillShown] = useState(25);
  const [tableQuery, setTableQuery] = useState("");

  async function openDrilldown(domain: string) {
    if (drilldown?.domain === domain) {
      setDrilldown(null);
      return;
    }
    setDrillLoading(domain);
    setDrilldown(null);
    setDrillSearch("");
    setDrillShown(25);
    try {
      const res = await fetch(`/api/ads/auction/domain?domain=${encodeURIComponent(domain)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setDrilldown(data);
    } catch (e) {
      showToast(`✗ Drilldown mislukt: ${String(e)}`);
    } finally {
      setDrillLoading(null);
    }
  }

  // Escape closes the drilldown drawer.
  useEffect(() => {
    if (!drilldown) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrilldown(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drilldown]);

  function exportDrilldownCsv() {
    if (!drilldown) return;
    const esc = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Keyword", "Match", "Adgroep", "Campagne", "Dagen aanwezig", "Eerst gezien", "Laatst gezien"];
    const lines = drilldown.keywords.map((k) =>
      [k.text, k.matchType, k.adGroup, k.campaign, k.daysSeen, k.firstSeen, k.lastSeen].map(esc).join(";")
    );
    const blob = new Blob(["﻿" + [header.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `auction-${drilldown.domain}-${drilldown.windowEnd}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ads/auction/presence");
      const data = await res.json();
      setCompetitors(data.competitors ?? []);
      setCoverage(data.coverage ?? null);
      setChanges(data.changes ?? []);
    } catch {
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function syncNow() {
    setSyncing(true);
    try {
      // Session-authed manual run of the daily sync (cron-gated route also
      // accepts a dashboard session — that's the "run it now" path).
      const res = await fetch("/api/ads/auction/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      const total = (data.results ?? []).reduce((s: number, r: { stored: number }) => s + r.stored, 0);
      showToast(`✓ Sync klaar — ${total} nieuwe aanwezigheidsrijen opgeslagen`);
      await load();
    } catch (e) {
      showToast(`✗ Sync mislukt: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function importCsv() {
    setImporting(true);
    try {
      const res = await fetch("/api/ads/auction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, pulledOn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      showToast(`✓ ${data.imported} domeinen geïmporteerd (CSV-dagpunt)`);
      setCsv("");
      await load();
    } catch (e) {
      showToast(`✗ Import mislukt: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  const chartData = (competitors ?? []).slice(0, 12).map((c) => ({
    domain: c.domain,
    dagen: c.daysSeen30,
    status: c.status,
  }));

  return (
    <div className="space-y-4">
      {/* What's changing — max 3 insights, rest lives in the table */}
      {changes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Wat verandert er</h3>
          {changes.slice(0, 3).map((c, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${TONE_STYLE[c.tone]}`}>
              {c.tone === "warning" ? (
                <TrendingDown className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : c.tone === "good" ? (
                <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              )}
              <div>
                <p className="text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Swords className="h-5 w-5 text-brand" /> Wie biedt mee in je veilingen
          </CardTitle>
          <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncen…" : "Sync nu"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : !competitors?.length ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Nog geen auction-data. Klik op &quot;Sync nu&quot; — de eerste run haalt 90 dagen
                historiek op uit de Google Ads API.
              </p>
            </div>
          ) : (
            <>
              {/* Searchable competitor table — the primary view */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={tableQuery}
                    onChange={(e) => setTableQuery(e.target.value)}
                    placeholder="Zoek domein…"
                    className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm"
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {(competitors ?? []).filter((c) => !tableQuery.trim() || c.domain.includes(tableQuery.trim().toLowerCase())).length} van {competitors.length} domeinen
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Domein</th>
                      <th className="py-2 pr-3">Eerst gezien</th>
                      <th className="py-2 pr-3">Laatst gezien</th>
                      <th className="py-2 pr-3 text-right">Aanwezig (30d)</th>
                      <th className="py-2 pr-3">Campagnes</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors
                      .filter((c) => !tableQuery.trim() || c.domain.includes(tableQuery.trim().toLowerCase()))
                      .map((c) => {
                      const st = STATUS_STYLE[c.status];
                      return (
                        <tr key={c.domain} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-2 pr-3">
                            <button
                              onClick={() => openDrilldown(c.domain)}
                              className="font-medium text-left hover:text-brand underline-offset-2 hover:underline"
                              title="Toon welke keywords dit domein beconcurreert"
                            >
                              {drillLoading === c.domain ? "laden…" : c.domain}
                            </button>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{dateShort(c.firstSeen)}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{dateShort(c.lastSeen)}</td>
                          <td className="py-2 pr-3 text-right">{c.daysSeen30} / 30</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground max-w-56">
                            <span className="line-clamp-2" title={c.campaigns30.join(", ")}>
                              {c.campaigns30.length} — {c.campaigns30.slice(0, 2).join(", ")}{c.campaigns30.length > 2 ? "…" : ""}
                            </span>
                          </td>
                          <td className="py-2">
                            <span title={c.statusReason}><Badge className={st.cls}>{st.label}</Badge></span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Compact context chart — presence days are NOT impression share */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Top {Math.min(8, chartData.length)} domeinen — aanwezige dagen van de laatste 30 (geen impression share)
                </p>
                <ResponsiveContainer width="100%" height={Math.min(240, Math.max(140, Math.min(8, chartData.length) * 28))}>
                  <BarChart data={chartData.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" domain={[0, 30]} tick={{ fontSize: 11 }} className="fill-muted-foreground" label={{ value: "dagen", position: "insideBottomRight", fontSize: 10 }} />
                    <YAxis type="category" dataKey="domain" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={120} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(value) => [`${Number(value)} van 30 dagen`, "Aanwezig"]}
                    />
                    <Bar dataKey="dagen" radius={[0, 4, 4, 0]}>
                      {chartData.slice(0, 8).map((c) => (
                        <Cell
                          key={c.domain}
                          fill={c.status === "expanding" ? "#f59e0b" : c.status === "cooling" ? "#10b981" : c.status === "new" ? "#3b82f6" : "#6366f1"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {coverage && (
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  Dekking vanaf {coverage.coverageFrom ? dateShort(coverage.coverageFrom) : "—"} · {coverage.totalRows.toLocaleString("nl-BE")} waarnemingen
                  {coverage.lastSyncAt && ` · laatste sync ${new Date(coverage.lastSyncAt).toLocaleString("nl-BE")}`}.
                  {" "}{coverage.note}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Own impression share over time — stacked: won / lost by rank / lost by budget */}
      <OwnShareCard />

      {/* CSV fallback (manual) */}
      <Card>
        <CardHeader>
          <button onClick={() => setCsvOpen(!csvOpen)} className="text-left">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Upload className="h-4 w-4" /> Handmatige CSV-import (fallback) {csvOpen ? "▾" : "▸"}
            </CardTitle>
          </button>
        </CardHeader>
        {csvOpen && (
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Alleen nodig voor scopes die de API niet dekt. Google Ads → Campagnes → Statistieken en
              rapporten → Auction insights → download als CSV → plak hieronder.
            </p>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder='Plak hier de CSV uit Google Ads (bijv. "Display URL domain,Impression share,...")'
              className="w-full h-24 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">
                Datum van export:{" "}
                <input
                  type="date"
                  value={pulledOn}
                  onChange={(e) => setPulledOn(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <Button size="sm" onClick={importCsv} disabled={!csv.trim() || importing}>
                {importing ? "Importeren…" : "Importeer"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Drilldown drawer — adjacent panel, all keywords with search/export */}
      {drilldown && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setDrilldown(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Keyword-drilldown ${drilldown.domain}`}
        >
          <div
            className="h-full w-full max-w-2xl bg-card border-l border-border shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            ref={(el) => el?.querySelector<HTMLInputElement>("input")?.focus()}
          >
            <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-start justify-between gap-3 z-10">
              <div>
                <p className="font-semibold">{drilldown.domain}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Beconcurreert {drilldown.keywords.length} keyword{drilldown.keywords.length === 1 ? "" : "s"} ·{" "}
                  {dateShort(drilldown.windowStart)} → {dateShort(drilldown.windowEnd)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={exportDrilldownCsv} disabled={!drilldown.keywords.length}>
                  <Download className="h-4 w-4 mr-1" /> CSV ({drilldown.keywords.length})
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDrilldown(null)} aria-label="Sluit drilldown">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {drilldown.note ? (
                <p className="text-xs text-muted-foreground">{drilldown.note}</p>
              ) : (
                <>
                  <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={drillSearch}
                      onChange={(e) => { setDrillSearch(e.target.value); setDrillShown(25); }}
                      placeholder="Zoek in keywords, adgroepen, campagnes…"
                      className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm"
                    />
                  </div>
                  {(() => {
                    const q = drillSearch.trim().toLowerCase();
                    const filtered = drilldown.keywords.filter((k) =>
                      !q || k.text.toLowerCase().includes(q) || k.adGroup.toLowerCase().includes(q) || k.campaign.toLowerCase().includes(q)
                    );
                    const visibleRows = filtered.slice(0, drillShown);
                    return (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {visibleRows.length} van {filtered.length} keywords{q ? ` (gefilterd uit ${drilldown.keywords.length})` : ""}
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-card">
                              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                                <th className="py-1.5 pr-3">Keyword</th>
                                <th className="py-1.5 pr-3">Match</th>
                                <th className="py-1.5 pr-3">Adgroep</th>
                                <th className="py-1.5 pr-3">Campagne</th>
                                <th className="py-1.5 pr-3 text-right">Dagen</th>
                                <th className="py-1.5">Laatst</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleRows.map((k) => (
                                <tr key={`${k.text}|${k.adGroup}`} className="border-b border-border/40">
                                  <td className="py-1.5 pr-3 font-medium">{k.text}</td>
                                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{k.matchType}</td>
                                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{k.adGroup}</td>
                                  <td className="py-1.5 pr-3 text-xs text-muted-foreground max-w-48 truncate" title={k.campaign}>{k.campaign}</td>
                                  <td className="py-1.5 pr-3 text-right">{k.daysSeen}</td>
                                  <td className="py-1.5 text-xs text-muted-foreground">{dateShort(k.lastSeen)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {filtered.length > drillShown && (
                          <div className="text-center pt-1">
                            <Button size="sm" variant="outline" onClick={() => setDrillShown((n) => n + 50)}>
                              Toon meer ({visibleRows.length} van {filtered.length})
                            </Button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
