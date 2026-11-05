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
import { Swords, Upload, RefreshCw, TrendingUp, TrendingDown, Info } from "lucide-react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

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

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  new: { label: "Nieuw", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  expanding: { label: "Actiever", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  steady: { label: "Stabiel", cls: "bg-muted/40 text-muted-foreground border-border" },
  cooling: { label: "Afbouwend", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

const TONE_STYLE: Record<string, string> = {
  warning: "border-amber-500/30 bg-amber-500/5",
  good: "border-emerald-500/30 bg-emerald-500/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

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
      {/* What's changing */}
      {changes.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Wat verandert er</h3>
          {changes.map((c, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${TONE_STYLE[c.tone]}`}>
              {c.tone === "warning" ? (
                <TrendingDown className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
              ) : c.tone === "good" ? (
                <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
              ) : (
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />
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
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" domain={[0, 30]} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis type="category" dataKey="domain" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={120} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(value) => [`${Number(value)} van 30 dagen`, "Aanwezig"]}
                  />
                  <Bar dataKey="dagen" radius={[0, 4, 4, 0]}>
                    {chartData.map((c) => (
                      <Cell
                        key={c.domain}
                        fill={c.status === "expanding" ? "#f59e0b" : c.status === "cooling" ? "#10b981" : c.status === "new" ? "#3b82f6" : "#6366f1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

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
                    {competitors.map((c) => {
                      const st = STATUS_STYLE[c.status];
                      return (
                        <tr key={c.domain} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-2 pr-3 font-medium">{c.domain}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{c.firstSeen}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{c.lastSeen}</td>
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

              {coverage && (
                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  Dekking vanaf {coverage.coverageFrom ?? "—"} · {coverage.totalRows.toLocaleString("nl-BE")} waarnemingen
                  {coverage.lastSyncAt && ` · laatste sync ${new Date(coverage.lastSyncAt).toLocaleString("nl-BE")}`}.
                  {" "}{coverage.note}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
