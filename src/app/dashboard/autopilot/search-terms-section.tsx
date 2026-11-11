"use client";

// ─── Full search terms report (Bavian-style: every term, matched keyword,
// status, CTR/CPC, inline exclude, CSV export) ───

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search as SearchIcon, Download } from "lucide-react";

export interface SearchTermRow {
  term: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  matchedKeyword: string | null;
  matchType: string | null;
  termStatus: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  verdict: "waste" | "review" | "expensive" | "low_ctr" | "winner" | "neutral";
  reason: string;
  aiVerdict?: "relevant" | "irrelevant" | "brand" | null;
  aiReason?: string | null;
}

export const eur = (micros: number) =>
  `€${(micros / 1_000_000).toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  waste: { label: "Verspilling", cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  review: { label: "Beoordelen", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  expensive: { label: "Duur", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  low_ctr: { label: "Lage CTR", cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30" },
  winner: { label: "Winnaar", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  neutral: { label: "OK", cls: "bg-muted/40 text-muted-foreground border-border" },
};

export const AI_STYLE: Record<string, { label: string; cls: string }> = {
  irrelevant: { label: "AI: irrelevant", cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  relevant: { label: "AI: relevant", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  brand: { label: "AI: merk", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
};

const TERM_STATUS: Record<string, { label: string; cls: string }> = {
  ADDED: { label: "Keyword", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  EXCLUDED: { label: "Uitgesloten", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  ADDED_EXCLUDED: { label: "Keyword + uitgesloten", cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  NONE: { label: "—", cls: "bg-muted/40 text-muted-foreground border-border" },
};

export function SearchTermsSection({
  terms,
  loading,
  busy,
  onExclude,
}: {
  terms: SearchTermRow[] | null;
  loading: boolean;
  busy: string | null;
  onExclude: (t: SearchTermRow) => void;
}) {
  const [filter, setFilter] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const rows = (terms ?? []).filter((t) => {
    if (onlyFlagged && t.verdict === "neutral") return false;
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (
      t.term.toLowerCase().includes(q) ||
      (t.matchedKeyword ?? "").toLowerCase().includes(q) ||
      t.campaignName.toLowerCase().includes(q) ||
      t.adGroupName.toLowerCase().includes(q)
    );
  });

  function downloadCsv() {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Zoekterm", "Matched keyword", "Match", "Status", "Campagne", "Adgroep", "Kliks", "Vertoningen", "CTR %", "Gem. CPC", "Kosten", "Conversies", "Verdict", "AI"];
    const lines = rows.map((t) => [
      t.term,
      t.matchedKeyword ?? "",
      t.matchType ?? "",
      t.termStatus,
      t.campaignName,
      t.adGroupName,
      t.clicks,
      t.impressions,
      t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(2) : "0",
      t.clicks > 0 ? (t.costMicros / 1_000_000 / t.clicks).toFixed(2) : "0",
      (t.costMicros / 1_000_000).toFixed(2),
      t.conversions,
      t.verdict,
      t.aiVerdict ?? "",
    ].map(esc).join(";"));
    // BOM + semicolons: opens correctly in Dutch Excel.
    const blob = new Blob(["﻿" + [header.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zoektermen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <SearchIcon className="h-5 w-5 text-brand" /> Alle zoektermen ({rows.length})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            placeholder="Zoek op term, keyword, campagne…"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm w-64"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyFlagged}
              onChange={(e) => { setOnlyFlagged(e.target.checked); setPage(0); }}
              className="accent-red-500"
            />
            Alleen geflagd
          </label>
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Geen zoektermen gevonden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Zoekterm</th>
                  <th className="py-2 pr-3">Matched keyword</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Campagne / Adgroep</th>
                  <th className="py-2 pr-3 text-right">Kliks</th>
                  <th className="py-2 pr-3 text-right">Impr.</th>
                  <th className="py-2 pr-3 text-right">CTR</th>
                  <th className="py-2 pr-3 text-right">CPC</th>
                  <th className="py-2 pr-3 text-right">Kosten</th>
                  <th className="py-2 pr-3 text-right">Conv.</th>
                  <th className="py-2 pr-3">Verdict</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map((t) => {
                  const key = `${t.campaignId}:${t.term}`;
                  const v = VERDICT_STYLE[t.verdict];
                  const st = TERM_STATUS[t.termStatus] ?? TERM_STATUS.NONE;
                  const ai = t.aiVerdict ? AI_STYLE[t.aiVerdict] : null;
                  return (
                    <tr key={key} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 pr-3">
                        <div className="font-medium max-w-64 truncate" title={t.term}>{t.term}</div>
                        {t.reason && <div className="text-xs text-muted-foreground">{t.reason}</div>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {t.matchedKeyword ? (
                          <>{t.matchedKeyword} <span className="text-muted-foreground/60">({t.matchType})</span></>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-3"><Badge className={st.cls}>{st.label}</Badge></td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground max-w-48">
                        <div className="truncate" title={t.campaignName}>{t.campaignName}</div>
                        <div className="truncate text-muted-foreground/60" title={t.adGroupName}>{t.adGroupName}</div>
                      </td>
                      <td className="py-2 pr-3 text-right">{t.clicks}</td>
                      <td className="py-2 pr-3 text-right">{t.impressions.toLocaleString("nl-BE")}</td>
                      <td className="py-2 pr-3 text-right">
                        {t.impressions > 0 ? `${((t.clicks / t.impressions) * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {t.clicks > 0 ? eur(t.costMicros / t.clicks) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">{eur(t.costMicros)}</td>
                      <td className="py-2 pr-3 text-right">{t.conversions}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-1 items-start">
                          {t.verdict !== "neutral" && (
                            <span title={t.reason}><Badge className={v.cls}>{v.label}</Badge></span>
                          )}
                          {ai && <span title={t.aiReason ?? ""}><Badge className={ai.cls}>{ai.label}</Badge></span>}
                          {t.verdict === "neutral" && !ai && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        {t.termStatus === "EXCLUDED" || t.termStatus === "ADDED_EXCLUDED" ? (
                          <span className="text-xs text-muted-foreground">✓</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === `st:${key}`}
                            onClick={() => onExclude(t)}
                          >
                            {busy === `st:${key}` ? "…" : "Blokkeer"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(() => {
              const totalPages = Math.ceil(rows.length / PER_PAGE);
              const clamped = Math.min(page, Math.max(0, totalPages - 1));
              if (totalPages <= 1) return null;
              return (
                <div className="flex items-center justify-center gap-1 pt-3">
                  <Button size="sm" variant="outline" disabled={clamped === 0} onClick={() => setPage(clamped - 1)}>‹ Vorige</Button>
                  <span className="px-2 text-xs text-muted-foreground">
                    Pagina {clamped + 1} van {totalPages} · {rows.length} termen
                  </span>
                  <Button size="sm" variant="outline" disabled={clamped >= totalPages - 1} onClick={() => setPage(clamped + 1)}>Volgende ›</Button>
                </div>
              );
            })()}
            {rows.length > 300 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                Grote lijst — gebruik het zoekveld of download de CSV ({rows.length} rijen) om alles in Excel te zien.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
