"use client";

// ─── Ad variants (RSA) with per-headline performance + inline editor ───
// Read: ad_group_ad + ad_group_ad_asset_view (per-asset metrics are partial
// by design — null renders as "—", never as zero).
// Write: every edit goes through the session-gated actions route and lands
// directly in Google Ads (audit-logged). Google limits enforced client-side
// AND server-side: 3–15 headlines × 30 chars, 2–4 descriptions × 90 chars.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, PauseCircle, PlayCircle, X, Check, Plus } from "lucide-react";
import { eur } from "./search-terms-section";

const ACCOUNT_ID = "668-709-2345";

interface RsaText {
  text: string;
  performanceLabel: string | null;
  approvalStatus: string | null;
  impressions: number | null;
  clicks: number | null;
  costMicros: number | null;
  conversions: number | null;
}

interface AdVariantRow {
  resourceName: string;
  adId: string;
  name: string;
  status: string;
  adType: string;
  campaignName: string;
  adGroupName: string;
  finalUrl: string | null;
  headlines: RsaText[];
  descriptions: RsaText[];
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}

const PERF_STYLE: Record<string, { label: string; cls: string }> = {
  GOOD: { label: "Goed", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  LEARNING: { label: "Leert", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  LOW: { label: "Zwak", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  PENDING: { label: "In afwachting", cls: "bg-muted/40 text-muted-foreground border-border" },
};

const APPROVAL_STYLE: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Goedgekeurd", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  APPROVED_LIMITED: { label: "Beperkt", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  UNDER_REVIEW: { label: "In review", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  DISAPPROVED: { label: "Afgekeurd", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

function TextTable({
  title,
  items,
  limit,
  editing,
  draft,
  onChange,
}: {
  title: string;
  items: RsaText[];
  limit: number;
  editing: boolean;
  draft: string[];
  onChange: (next: string[]) => void;
}) {
  const values = editing ? draft : items.map((i) => i.text);
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">
        {title} ({values.length}{title === "Headlines" ? " / 15" : " / 4"})
      </p>
      <div className="space-y-1.5">
        {values.map((text, i) => {
          const meta = items[i];
          const over = [...text].length > limit;
          return (
            <div key={i} className="flex items-center gap-2">
              {editing ? (
                <>
                  <input
                    value={text}
                    onChange={(e) => {
                      const next = [...draft];
                      next[i] = e.target.value;
                      onChange(next);
                    }}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-sm bg-background ${over ? "border-red-500" : "border-border"}`}
                  />
                  <span className={`text-xs w-12 text-right ${over ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
                    {[...text].length}/{limit}
                  </span>
                  <button
                    onClick={() => onChange(draft.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-red-400"
                    title="Verwijder"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm truncate" title={text}>{text}</span>
                  {meta?.performanceLabel && PERF_STYLE[meta.performanceLabel] && (
                    <Badge className={PERF_STYLE[meta.performanceLabel].cls}>
                      {PERF_STYLE[meta.performanceLabel].label}
                    </Badge>
                  )}
                  {meta?.approvalStatus && meta.approvalStatus !== "APPROVED" && APPROVAL_STYLE[meta.approvalStatus] && (
                    <Badge className={APPROVAL_STYLE[meta.approvalStatus].cls}>
                      {APPROVAL_STYLE[meta.approvalStatus].label}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground w-20 text-right">
                    {meta?.impressions !== null && meta?.impressions !== undefined
                      ? `${meta.impressions.toLocaleString("nl-BE")} imp · ${meta.conversions ?? 0} conv`
                      : "—"}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
      {editing && values.length < (title === "Headlines" ? 15 : 4) && (
        <button
          onClick={() => onChange([...draft, ""])}
          className="mt-1.5 flex items-center gap-1 text-xs text-brand hover:underline"
        >
          <Plus className="h-3 w-3" /> Toevoegen
        </button>
      )}
    </div>
  );
}

export function AdsSection({
  dateRange,
  busy,
  onAction,
}: {
  dateRange: string;
  busy: string | null;
  onAction: (body: Record<string, unknown>, busyKey: string) => void;
}) {
  const [ads, setAds] = useState<AdVariantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftHeadlines, setDraftHeadlines] = useState<string[]>([]);
  const [draftDescriptions, setDraftDescriptions] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/ads/ads?accountId=${ACCOUNT_ID}&dateRange=${dateRange}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setAds(data.ads ?? []);
    } catch (e) {
      setError(String(e));
      setAds([]);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  // Reload after a successful mutation (busy flips back to null).
  useEffect(() => {
    if (busy === null && ads !== null && !editing) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  function startEdit(ad: AdVariantRow) {
    setEditing(ad.resourceName);
    setDraftHeadlines(ad.headlines.map((h) => h.text));
    setDraftDescriptions(ad.descriptions.map((d) => d.text));
  }

  function saveEdit(ad: AdVariantRow) {
    onAction(
      {
        type: "update_ad_texts",
        customerId: ACCOUNT_ID,
        adResourceName: ad.resourceName,
        headlines: draftHeadlines.filter((h) => h.trim()),
        descriptions: draftDescriptions.filter((d) => d.trim()),
        label: `${ad.name} (${ad.adGroupName})`,
      },
      `ad:${ad.resourceName}`
    );
    setEditing(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Advertenties ({ads?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-400 py-2">{error}</p>}
        {!ads ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !ads.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Geen actieve advertenties met vertoningen in deze periode.</p>
        ) : (
          <div className="space-y-2">
            {ads.map((ad) => {
              const open = expanded === ad.resourceName;
              const isEditing = editing === ad.resourceName;
              return (
                <div key={ad.resourceName} className="rounded-lg border border-border">
                  <button
                    onClick={() => setExpanded(open ? null : ad.resourceName)}
                    className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/20"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{ad.name}</span>
                        <Badge className={ad.status === "ENABLED"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground border-border"}>
                          {ad.status === "ENABLED" ? "Actief" : "Gepauzeerd"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{ad.adType.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {ad.campaignName} / {ad.adGroupName}
                      </p>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground shrink-0">
                      <span>{ad.impressions.toLocaleString("nl-BE")} imp</span>
                      <span>{ad.clicks} kliks</span>
                      <span>{ad.impressions > 0 ? `${((ad.clicks / ad.impressions) * 100).toFixed(1)}%` : "—"} CTR</span>
                      <span className="font-medium text-foreground">{eur(ad.costMicros)}</span>
                      <span>{ad.conversions} conv</span>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-border px-4 py-4 space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs text-muted-foreground">
                          Google ad ID {ad.adId}
                          {ad.finalUrl && <> · <span className="text-foreground">{ad.finalUrl}</span></>}
                        </p>
                        <div className="flex gap-2">
                          {!isEditing && (
                            <Button size="sm" variant="outline" onClick={() => startEdit(ad)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Teksten bewerken
                            </Button>
                          )}
                          {ad.status === "ENABLED" ? (
                            <Button
                              size="sm" variant="outline"
                              disabled={busy === `adstatus:${ad.resourceName}`}
                              onClick={() => onAction({ type: "set_ad_status", customerId: ACCOUNT_ID, adResourceName: ad.resourceName, status: "PAUSED", label: ad.name }, `adstatus:${ad.resourceName}`)}
                            >
                              <PauseCircle className="h-3.5 w-3.5 mr-1" /> Pauzeer
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              disabled={busy === `adstatus:${ad.resourceName}`}
                              onClick={() => onAction({ type: "set_ad_status", customerId: ACCOUNT_ID, adResourceName: ad.resourceName, status: "ENABLED", label: ad.name }, `adstatus:${ad.resourceName}`)}
                            >
                              <PlayCircle className="h-3.5 w-3.5 mr-1" /> Activeer
                            </Button>
                          )}
                        </div>
                      </div>

                      <TextTable
                        title="Headlines"
                        items={ad.headlines}
                        limit={30}
                        editing={isEditing}
                        draft={draftHeadlines}
                        onChange={setDraftHeadlines}
                      />
                      <TextTable
                        title="Descriptions"
                        items={ad.descriptions}
                        limit={90}
                        editing={isEditing}
                        draft={draftDescriptions}
                        onChange={setDraftDescriptions}
                      />

                      {isEditing && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            disabled={busy === `ad:${ad.resourceName}`}
                            onClick={() => saveEdit(ad)}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            {busy === `ad:${ad.resourceName}` ? "Opslaan…" : "Opslaan naar Google Ads"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Annuleer
                          </Button>
                          <p className="text-xs text-muted-foreground self-center">
                            Opslaan wijzigt de live advertentie direct — er is geen conceptfase in Google Ads.
                          </p>
                        </div>
                      )}

                      {!isEditing && (
                        <p className="text-xs text-muted-foreground">
                          Per-headline cijfers komen van Google&apos;s asset-rapportage en zijn deels —
                          geen cijfer betekent niet gerapporteerd, niet nul.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
