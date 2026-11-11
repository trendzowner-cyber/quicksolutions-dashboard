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
  Search as SearchIcon, KeyRound, Layers, Ban, Megaphone, Target,
  Link2, Crosshair, MapPin, Brain,
} from "lucide-react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from "recharts";
import {
  SearchTermsSection, VERDICT_STYLE, AI_STYLE, eur,
  type SearchTermRow,
} from "./search-terms-section";
import { CompetitorTracker } from "./competitor-tracker";
import { CampaignsSection, KeywordsSection, NegativesSection } from "./inventory-sections";
import { AuctionPresenceSection } from "./auction-presence";
import { AdsSection } from "./ads-section";
import { ConversionsSection } from "./conversions-section";
import { AgentSection } from "./agent-section";
import { CreateCampaignWizard } from "./create-campaign";
import { ContextSection, BiddingSection, LocationsSection } from "./context-bidding-locations";
import { AssetsSection } from "./assets-section";
import { BudgetSection } from "./budget-section";
import { MiniMarkdown } from "@/components/ui/mini-markdown";

// ─── Types (mirror of src/lib/ads-autopilot.ts, ads-audit.ts, ads-auction.ts) ───

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

interface DayPoint {
  date: string;
  fullDate: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  allConversions: number;
  convValue: number;
  impressionShare: number | null;
}

// Metric definitions for the insights chart (Bavian-style picker).
const CHART_METRICS: Record<string, { label: string; color: string; fmt: (v: number) => string }> = {
  spend: { label: "Spend", color: "#f59e0b", fmt: (v) => `€${v.toLocaleString("nl-BE", { maximumFractionDigits: 0 })}` },
  clicks: { label: "Kliks", color: "#3b82f6", fmt: (v) => v.toLocaleString("nl-BE") },
  impressions: { label: "Impressies", color: "#8b5cf6", fmt: (v) => v.toLocaleString("nl-BE", { notation: "compact" }) },
  ctr: { label: "CTR", color: "#06b6d4", fmt: (v) => `${v.toFixed(2)}%` },
  conversions: { label: "Conversies", color: "#10b981", fmt: (v) => v.toLocaleString("nl-BE", { maximumFractionDigits: 1 }) },
  convValue: { label: "Conv. waarde", color: "#ec4899", fmt: (v) => `€${v.toLocaleString("nl-BE", { maximumFractionDigits: 0 })}` },
};

type Granularity = "day" | "week" | "month";
const MONTH_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function aggregateDays(days: DayPoint[], gran: Granularity): (DayPoint & { label: string; ctr: number })[] {
  const withCtr = (d: DayPoint & { label: string }) => ({
    ...d,
    ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
  });
  if (gran === "day") return days.map((d) => withCtr({ ...d, label: d.date }));
  const buckets = new Map<string, DayPoint & { label: string }>();
  for (const d of days) {
    const dt = new Date(`${d.fullDate}T00:00:00`);
    let key: string, label: string;
    if (gran === "week") {
      const monday = new Date(dt);
      monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
      label = `wk ${key.slice(5)}`;
    } else {
      key = d.fullDate.slice(0, 7);
      label = MONTH_NL[Number(key.slice(5)) - 1];
    }
    const b = buckets.get(key) ?? { ...d, label, spend: 0, clicks: 0, impressions: 0, conversions: 0, allConversions: 0, convValue: 0, impressionShare: null };
    b.spend += d.spend;
    b.clicks += d.clicks;
    b.impressions += d.impressions;
    b.conversions += d.conversions;
    b.allConversions += d.allConversions;
    b.convValue += d.convValue;
    buckets.set(key, b);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => withCtr(v));
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

const SEVERITY_STYLE: Record<string, { icon: React.ElementType; cls: string; badgeCls: string; label: string }> = {
  critical: { icon: XCircle, cls: "border-red-500/30 bg-red-500/5", badgeCls: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400", label: "Kritiek" },
  warning: { icon: AlertCircle, cls: "border-amber-500/30 bg-amber-500/5", badgeCls: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400", label: "Let op" },
  ok: { icon: CheckCircle2, cls: "border-emerald-500/30 bg-emerald-500/5", badgeCls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "OK" },
  unavailable: { icon: Info, cls: "border-border bg-muted/20", badgeCls: "border-border bg-muted/40 text-muted-foreground", label: "Niet meetbaar" },
};

const COMP_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Nieuw", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  steady: { label: "Stabiel", cls: "bg-muted/40 text-muted-foreground border-border" },
  expanding: { label: "Groeiend", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  gone: { label: "Weg", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

export default function AutopilotPage() {
  const [dateRange, setDateRange] = useState("LAST_30_DAYS");
  const [terms, setTerms] = useState<SearchTermRow[] | null>(null);
  const [budgets, setBudgets] = useState<BudgetAdvice[] | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[] | null>(null);
  const [allKeywords, setAllKeywords] = useState<KeywordRow[] | null>(null);
  const [days, setDays] = useState<DayPoint[] | null>(null);
  const [channelDays, setChannelDays] = useState<{ fullDate: string; search: number; pmax: number; demandGen: number; other: number }[] | null>(null);
  const [chartStacked, setChartStacked] = useState(false);
  const [chartMetric, setChartMetric] = useState<string>("spend");
  const [chartCampaign, setChartCampaign] = useState<string>("");
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [summary, setSummary] = useState<{ waste: number; winners: number; wasteCostMicros: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [kwPausePage, setKwPausePage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withAi: boolean) => {
    if (withAi) setAiLoading(true); else setLoading(true);
    setError(null);
    try {
      // GAQL has no LAST_90_DAYS preset — the API route takes start/end instead.
      let stRange = `dateRange=${dateRange}`;
      let otherRange = dateRange;
      if (dateRange === "LAST_90_DAYS") {
        const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        stRange = `start=${start}&end=${end}`;
        otherRange = "LAST_30_DAYS";
      }
      const q = `accountId=${ACCOUNT_ID}&dateRange=${otherRange}`;
      const [st, bg, kw, ts] = await Promise.all([
        fetch(`/api/ads/autopilot/search-terms?accountId=${ACCOUNT_ID}&${stRange}${withAi ? "&ai=1" : ""}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/budgets?${q}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/keywords?${q}`).then((r) => r.json()),
        fetch(`/api/ads/autopilot/timeseries?accountId=${ACCOUNT_ID}`).then((r) => r.json()),
      ]);
      if (st.error) throw new Error(st.details || st.error);
      setTerms(st.rows ?? []);
      setSummary(st.summary ?? null);
      setBudgets(bg.advice ?? []);
      setAllKeywords(kw.rows ?? []);
      setKeywords((kw.rows ?? []).filter((k: KeywordRow) => k.flag === "pause_candidate"));
      setDays(ts.days ?? []);
      setChannelDays(ts.channelDays ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(false); }, [load]);

  // Campaign list for the chart filter (once per mount — names rarely change)
  useEffect(() => {
    fetch(`/api/ads/campaigns?accountId=${ACCOUNT_ID}&dateRange=LAST_30_DAYS`)
      .then((r) => r.json())
      .then((d) => setCampaignOptions((d.campaigns ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, []);

  // Refetch only the timeseries when the chart campaign filter changes
  useEffect(() => {
    fetch(`/api/ads/autopilot/timeseries?accountId=${ACCOUNT_ID}${chartCampaign ? `&campaignId=${chartCampaign}` : ""}`)
      .then((r) => r.json())
      .then((ts) => { if (!ts.error) { setDays(ts.days ?? []); setChannelDays(ts.channelDays ?? []); } })
      .catch(() => {});
  }, [chartCampaign]);

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

  const wasteTerms = (terms ?? []).filter((t) => t.verdict === "waste" || t.verdict === "review" || t.verdict === "expensive");

  return (
    <div className="space-y-6">
      {/* Header — Google Ads identity + account/date/freshness context */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-google text-google-foreground shadow-sm">
            <Radar className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Google Ads <span className="text-google">Autopilot</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Vind verspilling, audit je account, volg concurrenten — jij beslist, de tool voert uit.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Account 668-709-2345 · periode: {dateRange === "LAST_7_DAYS" ? "7" : dateRange === "LAST_90_DAYS" ? "90" : "30"} dagen · Google Ads API v23 · tijdzone account (Europe/Brussels)
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
            <option value="LAST_90_DAYS">Laatste 90 dagen</option>
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
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <Tabs defaultValue="agent">
        {/* Sticky tab bar — single scrollable row so tabs never wrap/overlap */}
        <div className="sticky top-0 z-30 -mx-1 border-b border-border bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="overflow-x-auto [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
            <TabsList className="w-max flex-nowrap">
            <TabsTrigger value="agent" className="flex-none gap-2 text-sm">
              <Sparkles className="h-4 w-4" /> Agent
            </TabsTrigger>
            <TabsTrigger value="optimalisatie" className="flex-none gap-2 text-sm">
              <Radar className="h-4 w-4" /> Optimalisatie
            </TabsTrigger>
            <TabsTrigger value="zoektermen" className="flex-none gap-2 text-sm">
              <SearchIcon className="h-4 w-4" /> Zoektermen
            </TabsTrigger>
            <TabsTrigger value="keywords" className="flex-none gap-2 text-sm">
              <KeyRound className="h-4 w-4" /> Keywords
            </TabsTrigger>
            <TabsTrigger value="campagnes" className="flex-none gap-2 text-sm">
              <Layers className="h-4 w-4" /> Campagnes
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex-none gap-2 text-sm">
              <Link2 className="h-4 w-4" /> Assets
            </TabsTrigger>
            <TabsTrigger value="biedingen" className="flex-none gap-2 text-sm">
              <Crosshair className="h-4 w-4" /> Biedingen
            </TabsTrigger>
            <TabsTrigger value="locaties" className="flex-none gap-2 text-sm">
              <MapPin className="h-4 w-4" /> Locaties
            </TabsTrigger>
            <TabsTrigger value="budget" className="flex-none gap-2 text-sm">
              <Wallet className="h-4 w-4" /> Budget
            </TabsTrigger>
            <TabsTrigger value="context" className="flex-none gap-2 text-sm">
              <Brain className="h-4 w-4" /> Context
            </TabsTrigger>
            <TabsTrigger value="negatieven" className="flex-none gap-2 text-sm">
              <Ban className="h-4 w-4" /> Negatieven
            </TabsTrigger>
            <TabsTrigger value="advertenties" className="flex-none gap-2 text-sm">
              <Megaphone className="h-4 w-4" /> Advertenties
            </TabsTrigger>
            <TabsTrigger value="conversies" className="flex-none gap-2 text-sm">
              <Target className="h-4 w-4" /> Conversies
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex-none gap-2 text-sm">
              <ClipboardCheck className="h-4 w-4" /> Account Audit
            </TabsTrigger>
            <TabsTrigger value="concurrentie" className="flex-none gap-2 text-sm">
              <Swords className="h-4 w-4" /> Concurrentie
            </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* ═══ TAB 0: agent (approval-mode autopilot) ═══ */}
        <TabsContent value="agent" className="mt-4">
          <AgentSection accountId={ACCOUNT_ID} showToast={showToast} />
        </TabsContent>

        {/* ═══ TAB 1: optimization (waste finder, budgets, keywords) ═══ */}
        <TabsContent value="optimalisatie" className="mt-4 space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-5">
                {loading ? <Skeleton className="h-10 w-24" /> : (
                  <>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{eur(summary?.wasteCostMicros ?? 0)}</p>
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
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary?.winners ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Winnende termen (ROAS ≥ 3)</p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                {loading ? <Skeleton className="h-10 w-24" /> : (
                  <>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{keywords?.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Keywords om te pauzeren</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Insights chart — metric picker + granularity (Bavian-style) */}
          <Card>
            <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg">
                Prestaties — {dateRange === "LAST_7_DAYS" ? "7" : dateRange === "LAST_90_DAYS" ? "90" : "30"} dagen
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={chartCampaign}
                  onChange={(e) => setChartCampaign(e.target.value)}
                  className="max-w-48 truncate rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">Alle campagnes</option>
                  {campaignOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={chartMetric}
                  onChange={(e) => setChartMetric(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  {Object.entries(CHART_METRICS).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>
                <div className="flex rounded-md border border-border overflow-hidden text-sm">
                  {(["day", "week", "month"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={`px-2.5 py-1.5 ${granularity === g ? "bg-google text-google-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
                    >
                      {g === "day" ? "Dag" : g === "week" ? "Week" : "Maand"}
                    </button>
                  ))}
                </div>
                {chartMetric === "spend" && channelDays && channelDays.length > 0 && (
                  <button
                    onClick={() => setChartStacked(!chartStacked)}
                    className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${chartStacked ? "border-google/40 bg-google/10 text-google font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    Gestapeld per type
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading || !days ? (
                <Skeleton className="h-56 w-full" />
              ) : chartStacked && channelDays && channelDays.length > 0 ? (
                (() => {
                  // Stacked by channel type — Search / PMax / Demand Gen / Other
                  const CH_COLORS: Record<string, { label: string; color: string }> = {
                    search: { label: "Search", color: "#3b82f6" },
                    pmax: { label: "PMax", color: "#8b5cf6" },
                    demandGen: { label: "Demand Gen", color: "#f59e0b" },
                    other: { label: "Overig", color: "#6b7280" },
                  };
                  // Aggregate channel days by granularity
                  const buckets = new Map<string, { search: number; pmax: number; demandGen: number; other: number }>();
                  for (const d of channelDays) {
                    let key: string;
                    if (granularity === "month") key = d.fullDate.slice(0, 7);
                    else if (granularity === "week") {
                      const dt = new Date(d.fullDate + "T00:00:00");
                      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
                      key = dt.toISOString().slice(0, 10);
                    } else key = d.fullDate;
                    const cur = buckets.get(key) ?? { search: 0, pmax: 0, demandGen: 0, other: 0 };
                    cur.search += d.search; cur.pmax += d.pmax; cur.demandGen += d.demandGen; cur.other += d.other;
                    buckets.set(key, cur);
                  }
                  const stackData = [...buckets.entries()].map(([key, v]) => ({
                    label: granularity === "month"
                      ? MONTH_NL[Number(key.slice(5)) - 1]
                      : granularity === "week" ? `wk ${key.slice(5)}` : key.slice(5),
                    ...v,
                  }));
                  return (
                    <>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        {Object.values(CH_COLORS).map((c) => (
                          <span key={c.label} className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-4 rounded" style={{ background: c.color }} /> {c.label}
                          </span>
                        ))}
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stackData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                          <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `€${Number(v).toFixed(0)}`} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                            formatter={(value, name) => [`€${Number(value).toFixed(2)}`, CH_COLORS[name as string]?.label ?? name]}
                          />
                          <Bar dataKey="search" stackId="ch" fill={CH_COLORS.search.color} name="search" />
                          <Bar dataKey="pmax" stackId="ch" fill={CH_COLORS.pmax.color} name="pmax" />
                          <Bar dataKey="demandGen" stackId="ch" fill={CH_COLORS.demandGen.color} name="demandGen" />
                          <Bar dataKey="other" stackId="ch" fill={CH_COLORS.other.color} name="other" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  );
                })()
              ) : (
                (() => {
                  const m = CHART_METRICS[chartMetric];
                  const data = aggregateDays(days, granularity).map((d) => ({
                    ...d,
                    metric: chartMetric === "ctr" ? d.ctr : d[chartMetric as keyof DayPoint],
                  }));
                  return (
                    <>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-4 rounded" style={{ background: m.color }} /> {m.label} (links)
                        </span>
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <ComposedChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                          <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => m.fmt(Number(v))} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                            formatter={(value) => [m.fmt(Number(value)), m.label]}
                          />
                          <Area yAxisId="left" type="monotone" dataKey="metric" stroke={m.color} fill={m.color} fillOpacity={0.15} name={m.label} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </>
                  );
                })()
              )}
            </CardContent>
          </Card>

          {/* Waste finder */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" /> Verspillingsradar — zoektermen
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
              <p className="text-xs text-muted-foreground mb-3">
                Regels: <strong>Verspilling</strong> = ≥ €25 zonder conversie · <strong>Beoordelen</strong> = €10–25 zonder conversie
                (conversies kunnen nog binnenkomen) · <strong>Duur</strong> = CPA &gt; 2× campagne-gemiddelde ·
                window = gekozen periode.
              </p>
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
                          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : b.action === "decrease" ? (
                          <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
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
                <PauseCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" /> Keywords om te pauzeren
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : !keywords?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  <CheckCircle2 className="inline h-4 w-4 text-emerald-600 dark:text-emerald-400 mr-1" />
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
                      {(() => {
                        const PER = 10;
                        const total = Math.max(1, Math.ceil((keywords?.length ?? 0) / PER));
                        const pg = Math.min(kwPausePage, total - 1);
                        return (keywords ?? []).slice(pg * PER, pg * PER + PER).map((k) => (
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
                        ));
                      })()}
                    </tbody>
                  </table>
                  {(() => {
                    const PER = 10;
                    const total = Math.ceil((keywords?.length ?? 0) / PER);
                    if (total <= 1) return null;
                    const pg = Math.min(kwPausePage, total - 1);
                    return (
                      <div className="flex items-center justify-center gap-2 pt-3">
                        <Button size="sm" variant="outline" disabled={pg === 0} onClick={() => setKwPausePage(pg - 1)}>‹ Vorige</Button>
                        <span className="px-2 text-xs text-muted-foreground">Pagina {pg + 1} van {total} · {keywords?.length} keywords</span>
                        <Button size="sm" variant="outline" disabled={pg >= total - 1} onClick={() => setKwPausePage(pg + 1)}>Volgende ›</Button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 2: full search terms report ═══ */}
        <TabsContent value="zoektermen" className="mt-4">
          <SearchTermsSection
            terms={terms}
            loading={loading}
            busy={busy}
            onExclude={(t) =>
              applyAction(
                { type: "add_negatives", customerId: ACCOUNT_ID, campaignId: t.campaignId, terms: [t.term] },
                `st:${t.campaignId}:${t.term}`
              )
            }
          />
        </TabsContent>

        {/* ═══ TAB 3: keywords ═══ */}
        <TabsContent value="keywords" className="mt-4">
          <KeywordsSection
            keywords={allKeywords}
            loading={loading}
            busy={busy}
            onPause={(k) =>
              applyAction(
                { type: "pause_keyword", customerId: ACCOUNT_ID, criterionResourceName: k.resourceName, label: k.text },
                `kw:${k.resourceName}`
              )
            }
          />
        </TabsContent>

        {/* ═══ TAB 4: campaigns + impression share ═══ */}
        <TabsContent value="campagnes" className="mt-4 space-y-4">
          <CreateCampaignWizard accountId={ACCOUNT_ID} showToast={showToast} />
          <CampaignsSection dateRange={dateRange === "LAST_90_DAYS" ? "LAST_30_DAYS" : dateRange} />
        </TabsContent>

        {/* ═══ Assets: sitelinks/callouts editor + AI drafts + conversion create ═══ */}
        <TabsContent value="assets" className="mt-4">
          <AssetsSection accountId={ACCOUNT_ID} showToast={showToast} />
        </TabsContent>

        {/* ═══ Biedingen: per-campaign bid strategy overview (read-only) ═══ */}
        <TabsContent value="biedingen" className="mt-4">
          <BiddingSection accountId={ACCOUNT_ID} />
        </TabsContent>

        {/* ═══ Locaties: per-campaign geo targeting (read-only) ═══ */}
        <TabsContent value="locaties" className="mt-4">
          <LocationsSection accountId={ACCOUNT_ID} />
        </TabsContent>

        {/* ═══ Budget: total cap + AI allocation (Bavian parity) ═══ */}
        <TabsContent value="budget" className="mt-4">
          <BudgetSection accountId={ACCOUNT_ID} showToast={showToast} onProposalsChanged={() => load(false)} />
        </TabsContent>

        {/* ═══ Context: business profile + memory feeding the AI ═══ */}
        <TabsContent value="context" className="mt-4">
          <ContextSection showToast={showToast} />
        </TabsContent>

        {/* ═══ TAB 5: negative keywords ═══ */}
        <TabsContent value="negatieven" className="mt-4">
          <NegativesSection
            busy={busy}
            onUnblock={(n) =>
              applyAction(
                { type: "remove_negative", customerId: ACCOUNT_ID, resourceName: n.resourceName, label: n.text },
                `neg:${n.resourceName}`
              )
            }
          />
        </TabsContent>

        {/* ═══ TAB 6: ad variants (RSA editor) ═══ */}
        <TabsContent value="advertenties" className="mt-4">
          <AdsSection
            dateRange={dateRange === "LAST_90_DAYS" ? "LAST_30_DAYS" : dateRange}
            busy={busy}
            onAction={(body, key) => applyAction(body, key)}
          />
        </TabsContent>

        {/* ═══ TAB 7: conversion tracking ═══ */}
        <TabsContent value="conversies" className="mt-4">
          <ConversionsSection />
        </TabsContent>

        {/* ═══ TAB 8: account audit ═══ */}
        <TabsContent value="audit" className="mt-4">
          <AuditSection showToast={showToast} />
        </TabsContent>

        {/* ═══ TAB 9: competitors ═══ */}
        <TabsContent value="concurrentie" className="mt-4">
          <CompetitorSection showToast={showToast} />
        </TabsContent>
      </Tabs>

      {/* Monitor note */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
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
  const [summary, setSummary] = useState<{ critical: number; warning: number; ok: number; unavailable?: number } | null>(null);
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-5">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.critical}</p>
            <p className="text-xs text-muted-foreground mt-1">Kritieke bevindingen</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.warning}</p>
            <p className="text-xs text-muted-foreground mt-1">Aandachtspunten</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.ok}</p>
            <p className="text-xs text-muted-foreground mt-1">In orde</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-2xl font-bold text-muted-foreground">{summary.unavailable ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Overgeslagen (niet meetbaar — telt niet mee als OK)</p>
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
            <MiniMarkdown text={narrative} />
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
                    <Badge className={s.badgeCls}>{s.label}</Badge>
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
  return (
    <div className="space-y-4">
      <AuctionPresenceSection showToast={showToast} />
      <CompetitorTracker showToast={showToast} />
    </div>
  );
}
