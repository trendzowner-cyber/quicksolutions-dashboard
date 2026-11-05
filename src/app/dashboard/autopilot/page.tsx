"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Radar, Trash2, TrendingUp, TrendingDown, Minus, Sparkles,
  PauseCircle, Wallet, RefreshCw, CheckCircle2, AlertTriangle,
  ClipboardCheck, Swords, Upload, XCircle, AlertCircle, Info,
} from "lucide-react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";

// ─── Types (mirror of src/lib/ads-autopilot.ts, ads-audit.ts, ads-auction.ts) ───

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
  campaignName: string;
  adGroupName: string;
  costMicros: number;
  conversions: number;
  cpa: number | null;
  flag: "pause_candidate" | "ok";
  reason: string;
}

interface DayPoint {
  date: string;
  spend: number;
  clicks: number;
  conversions: number;
  impressionShare: number | null;
}

interface Finding {
  id: string;
  severity: "critical" | "warning" | "ok" | "unavailable";
  title: string;
  detail: string;
  stats?: Record<string, string>;
}

interface Competitor {
  domain: string;
  firstSeen: string;
  lastSeen: string;
  daysPresent30: number;
  campaigns: number;
  status: "new" | "steady" | "expanding" | "gone";
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

const SEVERITY_STYLE: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
  critical: { icon: XCircle, cls: "border-red-500/30 bg-red-500/5", label: "Kritiek" },
  warning: { icon: AlertCircle, cls: "border-amber-500/30 bg-amber-500/5", label: "Let op" },
  ok: { icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/5", label: "OK" },
  unavailable: { icon: Info, cls: "border-border bg-muted/20", label: "Niet meetbaar" },
};

const COMP_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Nieuw", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  steady: { label: "Stabiel", cls: "bg-muted/40 text-muted-foreground border-border" },
  expanding: { label: "Groeiend", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  gone: { label: "Weg", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

export default function AutopilotPage() {
  const [dateRange, setDateRange] = useState("LAST_30_DAYS");
  const [terms, setTerms] = useState<SearchTermRow[] | null>(null);
  const [budgets, setBudgets] = useState<BudgetAdvice[] | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[] | null>(null);
  const [days, setDays] = useState<DayPoint[] | null>(null);
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
      const [st, bg, kw, ts] = await Promise.all([
        fetch(`/api/ads/autopilot/search-terms?${q}${withAi ? "&ai=1" : ""}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/budgets?${q}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/keywords?${q}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/timeseries?accountId=${ACCOUNT_ID}`).then((r) => r.json()),
      ]);
      if (st.error) throw new Error(st.details || st.error);
      setTerms(st.rows ?? []);
      setSummary(st.summary ?? null);
      setBudgets(bg.advice ?? []);
      setKeywords((kw.rows ?? []).filter((k: KeywordRow) => k.flag === "pause_candidate"));
      setDays(ts.days ?? []);
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
              Vind verspilling, audit je account, volg concurrenten — jij beslist, de tool voert uit.
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

      {/* 30-day chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Spend &amp; conversies — 30 dagen</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !days ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={days}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(value, name) =>
                    name === "spend" ? [`€${Number(value).toFixed(2)}`, "Spend"] : [value, name === "conversions" ? "Conversies" : "Kliks"]
                  }
                />
                <Area yAxisId="left" type="monotone" dataKey="spend" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} name="spend" />
                <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} dot={false} name="conversions" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="optimalisatie">
        <TabsList className="h-10">
          <TabsTrigger value="optimalisatie" className="gap-2 text-sm">
            <Radar className="h-4 w-4" /> Optimalisatie
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 text-sm">
            <ClipboardCheck className="h-4 w-4" /> Account Audit
          </TabsTrigger>
          <TabsTrigger value="concurrentie" className="gap-2 text-sm">
            <Swords className="h-4 w-4" /> Concurrentie
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: optimization (waste finder, budgets, keywords) ═══ */}
        <TabsContent value="optimalisatie" className="mt-4 space-y-6">
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
        </TabsContent>

        {/* ═══ TAB 2: account audit ═══ */}
        <TabsContent value="audit" className="mt-4">
          <AuditSection showToast={showToast} />
        </TabsContent>

        {/* ═══ TAB 3: competitors ═══ */}
        <TabsContent value="concurrentie" className="mt-4">
          <CompetitorSection showToast={showToast} />
        </TabsContent>
      </Tabs>

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

// ─── Audit tab ───

function AuditSection({ showToast }: { showToast: (m: string) => void }) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ critical: number; warning: number; ok: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [withNarrative, setWithNarrative] = useState(true);

  async function runAudit() {
    setRunning(true);
    try {
      const res = await fetch(`/api/ads/audit?accountId=${ACCOUNT_ID}${withNarrative ? "&narrative=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setFindings(data.findings ?? []);
      setNarrative(data.narrative ?? null);
      setSummary(data.summary ?? null);
    } catch (e) {
      showToast(`✗ Audit mislukt: ${String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Account Audit</p>
            <p className="text-sm text-muted-foreground">
              Tien automatische checks: conversiemeting, policy, stille groepen, biedstrategie,
              negatieve lijsten, landingspagina&apos;s, geo-lekkage, Quality Score, merktermen in PMax, toestellen.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={withNarrative}
                onChange={(e) => setWithNarrative(e.target.checked)}
                className="accent-brand"
              />
              AI-samenvatting
            </label>
            <Button onClick={runAudit} disabled={running}>
              {running ? (
                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Audit loopt (±30s)…</>
              ) : (
                <><ClipboardCheck className="h-4 w-4 mr-1" /> Start audit</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-5">
            <p className="text-2xl font-bold text-red-400">{summary.critical}</p>
            <p className="text-xs text-muted-foreground mt-1">Kritieke bevindingen</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-2xl font-bold text-amber-400">{summary.warning}</p>
            <p className="text-xs text-muted-foreground mt-1">Aandachtspunten</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-2xl font-bold text-emerald-400">{summary.ok}</p>
            <p className="text-xs text-muted-foreground mt-1">In orde</p>
          </CardContent></Card>
        </div>
      )}

      {narrative && (
        <Card className="border-brand/30 bg-brand/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-brand" /> Wat de audit vond
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose-sm text-sm whitespace-pre-wrap leading-relaxed">{narrative}</div>
          </CardContent>
        </Card>
      )}

      {running && !findings && (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      )}

      {findings?.map((f) => {
        const s = SEVERITY_STYLE[f.severity];
        return (
          <Card key={f.id} className={s.cls}>
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <s.icon className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{f.title}</p>
                    <Badge className={s.cls}>{s.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{f.detail}</p>
                  {f.stats && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {Object.entries(f.stats).map(([k, v]) => (
                        <span key={k} className="text-xs">
                          <span className="text-muted-foreground">{k}: </span>
                          <span className="font-medium">{v}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!findings && !running && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nog geen audit gedraaid. Klik op &quot;Start audit&quot; — de checks lezen alleen, ze wijzigen niets.
        </p>
      )}
    </div>
  );
}

// ─── Competitors tab ───

function CompetitorSection({ showToast }: { showToast: (m: string) => void }) {
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [apiNote, setApiNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [csv, setCsv] = useState("");
  const [pulledOn, setPulledOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ads/auction");
      const data = await res.json();
      setCompetitors(data.competitors ?? []);
      setApiNote(data.api?.available ? null : data.api?.reason ?? null);
    } catch {
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      showToast(`✓ ${data.imported} domeinen geïmporteerd`);
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
    dagen: c.daysPresent30,
    status: c.status,
  }));

  return (
    <div className="space-y-4">
      {apiNote && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
          <p>
            {apiNote}{" "}
            In Google Ads: <strong>Campagnes → Statistieken en rapporten → Auction insights</strong> →
            download als CSV → plak hieronder. Elke upload is een dagpunt; na een paar weken zie je
            wie er structureel meebiedt op jouw veilingen.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-brand" /> Auction insights importeren
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder='Plak hier de CSV uit Google Ads (bijv. "Display URL domain,Impression share,...")'
            className="w-full h-28 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
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
      </Card>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !competitors?.length ? (
        <Card><CardContent className="pt-5">
          <p className="text-sm text-muted-foreground text-center py-6">
            Nog geen data. Importeer je eerste auction-insights CSV hierboven — vanaf de tweede
            upload begint de trend zichtbaar te worden.
          </p>
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Aanwezigheid laatste 30 dagen (top 12)</CardTitle>
            </CardHeader>
            <CardContent>
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
                        fill={c.status === "expanding" ? "#f59e0b" : c.status === "gone" ? "#10b981" : "#6366f1"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Concurrenten in je veilingen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Domein</th>
                      <th className="py-2 pr-3">Eerst gezien</th>
                      <th className="py-2 pr-3">Laatst gezien</th>
                      <th className="py-2 pr-3 text-right">Aanwezig (30d)</th>
                      <th className="py-2 pr-3 text-right">Campagnes</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((c) => {
                      const st = COMP_STATUS[c.status];
                      return (
                        <tr key={c.domain} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-2 pr-3 font-medium">{c.domain}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{c.firstSeen}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{c.lastSeen}</td>
                          <td className="py-2 pr-3 text-right">{c.daysPresent30} / 30</td>
                          <td className="py-2 pr-3 text-right">{c.campaigns}</td>
                          <td className="py-2"><Badge className={st.cls}>{st.label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
