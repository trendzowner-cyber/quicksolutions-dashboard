"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Radar, Trash2, TrendingUp, TrendingDown, Minus, Sparkles,
  PauseCircle, Wallet, RefreshCw, CheckCircle2, AlertTriangle,
} from "lucide-react";

// ─── Types (mirror of src/lib/ads-autopilot.ts) ───

interface SearchTermRow {
  term: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  verdict: "waste" | "expensive" | "low_ctr" | "winner" | "neutral";
  reason: string;
  aiVerdict?: "relevant" | "irrelevant" | "brand" | null;
  aiReason?: string | null;
}

interface BudgetAdvice {
  campaignId: string;
  campaignName: string;
  budgetResourceName: string | null;
  dailyBudgetMicros: number;
  costMicros: number;
  conversions: number;
  cpa: number | null;
  roas: number | null;
  action: "increase" | "decrease" | "hold";
  suggestedDailyBudgetMicros: number;
  reason: string;
}

interface KeywordRow {
  resourceName: string;
  text: string;
  matchType: string;
  status: string;
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

const ACCOUNT_ID = "668-709-2345";
const eur = (micros: number) =>
  `€${(micros / 1_000_000).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  waste: { label: "Verspilling", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  expensive: { label: "Duur", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  low_ctr: { label: "Lage CTR", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  winner: { label: "Winnaar", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  neutral: { label: "OK", cls: "bg-muted/40 text-muted-foreground border-border" },
};

const AI_STYLE: Record<string, { label: string; cls: string }> = {
  irrelevant: { label: "AI: irrelevant", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  relevant: { label: "AI: relevant", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  brand: { label: "AI: merk", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

export default function AutopilotPage() {
  const [dateRange, setDateRange] = useState("LAST_30_DAYS");
  const [terms, setTerms] = useState<SearchTermRow[] | null>(null);
  const [budgets, setBudgets] = useState<BudgetAdvice[] | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[] | null>(null);
  const [summary, setSummary] = useState<{ waste: number; winners: number; wasteCostMicros: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withAi: boolean) => {
    if (withAi) setAiLoading(true); else setLoading(true);
    setError(null);
    try {
      const q = `accountId=${ACCOUNT_ID}&dateRange=${dateRange}`;
      const [st, bg, kw] = await Promise.all([
        fetch(`/api/ads/autopilot/search-terms?${q}${withAi ? "&ai=1" : ""}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/budgets?${q}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/keywords?${q}`).then((r) => r.json()),
      ]);
      if (st.error) throw new Error(st.details || st.error);
      setTerms(st.rows ?? []);
      setSummary(st.summary ?? null);
      setBudgets(bg.advice ?? []);
      setKeywords((kw.rows ?? []).filter((k: KeywordRow) => k.flag === "pause_candidate"));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(false); }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  async function applyAction(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    try {
      const res = await fetch("/api/ads/autopilot/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      showToast(`✓ ${data.summary}`);
      await load(false);
    } catch (e) {
      showToast(`✗ Mislukt: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  function toggleTerm(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Negatives are applied per campaign — group the selection by campaign.
  async function applyNegatives() {
    const chosen = (terms ?? []).filter((t) => selected.has(`${t.campaignId}:${t.term}`));
    const byCampaign = new Map<string, string[]>();
    for (const t of chosen) {
      byCampaign.set(t.campaignId, [...(byCampaign.get(t.campaignId) ?? []), t.term]);
    }
    for (const [campaignId, campaignTerms] of byCampaign) {
      await applyAction(
        { type: "add_negatives", customerId: ACCOUNT_ID, campaignId, terms: campaignTerms },
        `neg:${campaignId}`
      );
    }
    setSelected(new Set());
  }

  const wasteTerms = (terms ?? []).filter((t) => t.verdict === "waste" || t.verdict === "expensive");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Radar className="h-7 w-7 text-brand" />
          <div>
            <h1 className="text-2xl font-bold">Ads Autopilot</h1>
            <p className="text-sm text-muted-foreground">
              Vind verspilling, verschuif budget, pauzeer verliezers — jij beslist, de tool voert uit.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="LAST_7_DAYS">Laatste 7 dagen</option>
            <option value="LAST_30_DAYS">Laatste 30 dagen</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Vernieuwen
          </Button>
          <Button size="sm" onClick={() => load(true)} disabled={loading || aiLoading}>
            <Sparkles className={`h-4 w-4 mr-1 ${aiLoading ? "animate-pulse" : ""}`} />
            {aiLoading ? "AI analyseert…" : "AI-analyse"}
          </Button>
        </div>
      </div>

      {toast && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{toast}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            {loading ? <Skeleton className="h-10 w-24" /> : (
              <>
                <p className="text-2xl font-bold text-red-400">{eur(summary?.wasteCostMicros ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Verspilde spend (0 conversies)</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            {loading ? <Skeleton className="h-10 w-24" /> : (
              <>
                <p className="text-2xl font-bold">{summary?.waste ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Verspillende zoektermen</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            {loading ? <Skeleton className="h-10 w-24" /> : (
              <>
                <p className="text-2xl font-bold text-emerald-400">{summary?.winners ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Winnende termen (ROAS ≥ 3)</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            {loading ? <Skeleton className="h-10 w-24" /> : (
              <>
                <p className="text-2xl font-bold text-amber-400">{keywords?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Keywords om te pauzeren</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Waste finder */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trash2 className="h-5 w-5 text-red-400" /> Verspillingsradar — zoektermen
          </CardTitle>
          <Button
            size="sm"
            variant="destructive"
            disabled={!selected.size || busy !== null}
            onClick={applyNegatives}
          >
            {busy?.startsWith("neg:") ? "Toepassen…" : `Blokkeer geselecteerde (${selected.size})`}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !wasteTerms.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Geen verspilling gevonden in deze periode. 🎉
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2"></th>
                    <th className="py-2 pr-3">Zoekterm</th>
                    <th className="py-2 pr-3">Campagne</th>
                    <th className="py-2 pr-3 text-right">Kosten</th>
                    <th className="py-2 pr-3 text-right">Kliks</th>
                    <th className="py-2 pr-3 text-right">Conv.</th>
                    <th className="py-2 pr-3">Verdict</th>
                    <th className="py-2">AI</th>
                  </tr>
                </thead>
                <tbody>
                  {wasteTerms.map((t) => {
                    const key = `${t.campaignId}:${t.term}`;
                    const v = VERDICT_STYLE[t.verdict];
                    const ai = t.aiVerdict ? AI_STYLE[t.aiVerdict] : null;
                    return (
                      <tr key={key} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={selected.has(key)}
                            onChange={() => toggleTerm(key)}
                            className="accent-red-500"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{t.term}</div>
                          <div className="text-xs text-muted-foreground">{t.reason}</div>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{t.campaignName}</td>
                        <td className="py-2 pr-3 text-right font-medium">{eur(t.costMicros)}</td>
                        <td className="py-2 pr-3 text-right">{t.clicks}</td>
                        <td className="py-2 pr-3 text-right">{t.conversions}</td>
                        <td className="py-2 pr-3"><Badge className={v.cls}>{v.label}</Badge></td>
                        <td className="py-2">
                          {ai ? (
                            <span title={t.aiReason ?? ""}>
                              <Badge className={ai.cls}>{ai.label}</Badge>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget advisor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-brand" /> Budgetadvies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
          ) : !budgets?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Geen actieve campagnes met budgetdata.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {budgets.map((b) => (
                <div
                  key={b.campaignId}
                  className={`rounded-lg border p-4 ${
                    b.action === "increase"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : b.action === "decrease"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{b.campaignName}</p>
                    {b.action === "increase" ? (
                      <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : b.action === "decrease" ? (
                      <TrendingDown className="h-4 w-4 text-amber-400 shrink-0" />
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{b.reason}</p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span>
                      {eur(b.dailyBudgetMicros)}/dag
                      {b.action !== "hold" && (
                        <span className="text-muted-foreground"> → {eur(b.suggestedDailyBudgetMicros)}/dag</span>
                      )}
                    </span>
                    {b.action !== "hold" && b.budgetResourceName && (
                      <Button
                        size="sm"
                        variant={b.action === "increase" ? "default" : "outline"}
                        disabled={busy === `budget:${b.campaignId}`}
                        onClick={() =>
                          applyAction(
                            {
                              type: "set_budget",
                              customerId: ACCOUNT_ID,
                              budgetResourceName: b.budgetResourceName,
                              amountMicros: b.suggestedDailyBudgetMicros,
                              label: b.campaignName,
                            },
                            `budget:${b.campaignId}`
                          )
                        }
                      >
                        {busy === `budget:${b.campaignId}` ? "…" : "Pas toe"}
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                    <span>Spend: {eur(b.costMicros)}</span>
                    <span>Conv: {b.conversions}</span>
                    <span>CPA: {b.cpa !== null ? eur(b.cpa) : "—"}</span>
                    <span>ROAS: {b.roas !== null ? b.roas.toFixed(1) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keyword pause candidates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PauseCircle className="h-5 w-5 text-amber-400" /> Keywords om te pauzeren
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !keywords?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              <CheckCircle2 className="inline h-4 w-4 text-emerald-400 mr-1" />
              Geen verlieslatende keywords gevonden.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3">Keyword</th>
                    <th className="py-2 pr-3">Campagne / Adgroep</th>
                    <th className="py-2 pr-3 text-right">Kosten</th>
                    <th className="py-2 pr-3 text-right">Conv.</th>
                    <th className="py-2 pr-3">Reden</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((k) => (
                    <tr key={k.resourceName} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{k.text}</span>{" "}
                        <span className="text-xs text-muted-foreground">({k.matchType})</span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {k.campaignName} / {k.adGroupName}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">{eur(k.costMicros)}</td>
                      <td className="py-2 pr-3 text-right">{k.conversions}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{k.reason}</td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === `kw:${k.resourceName}`}
                          onClick={() =>
                            applyAction(
                              {
                                type: "pause_keyword",
                                customerId: ACCOUNT_ID,
                                criterionResourceName: k.resourceName,
                                label: k.text,
                              },
                              `kw:${k.resourceName}`
                            )
                          }
                        >
                          {busy === `kw:${k.resourceName}` ? "…" : "Pauzeer"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitor note */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
        <p>
          De anomaliemonitor draait dagelijks via cron en stuurt een Telegram-melding bij
          spend-pieken, spend-dips, weggevallen conversies of CTR-instorting. De autopilot past
          <strong> nooit zelf</strong> iets aan — elke actie is een bewuste klik en wordt gelogd.
        </p>
      </div>
    </div>
  );
}
