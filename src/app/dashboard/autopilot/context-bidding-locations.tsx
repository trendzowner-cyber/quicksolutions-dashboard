"use client";

// ─── Context, Bidding, Locations sections (Bavian parity) ───

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Plus, X, MapPin, Crosshair } from "lucide-react";
import { eurMicros } from "@/lib/format";

const BIDDING_LABELS: Record<string, string> = {
  TARGET_SPEND: "Max. klikken (Target Spend)",
  MAXIMIZE_CONVERSIONS: "Max. conversies",
  MAXIMIZE_CONVERSION_VALUE: "Max. conversiewaarde",
  TARGET_CPA: "Doel-CPA",
  TARGET_ROAS: "Doel-ROAS",
  TARGET_IMPRESSION_SHARE: "Doel-vertoningsaandeel",
  MANUAL_CPC: "Handmatig CPC",
  ENHANCED_CPC: "Verbeterde CPC",
  TARGET_CPM: "Doel-CPM",
};

function biddingTypeLabel(t: string): string {
  return BIDDING_LABELS[t] ?? t.replace(/_/g, " ").toLowerCase();
}

// ─── Context: business profile + facts + rules (feeds the agent's AI) ───

interface MemoryRow { id: string; kind: string; text: string; source: string }

export function ContextSection({ showToast }: { showToast: (m: string) => void }) {
  const [memory, setMemory] = useState<MemoryRow[] | null>(null);
  const [profile, setProfile] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFact, setNewFact] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/ads/agent/memory").then((r) => r.json());
    const rows: MemoryRow[] = res.memory ?? [];
    setMemory(rows);
    const p = rows.find((r) => r.kind === "profile");
    setProfile(p?.text ?? "");
    setProfileId(p?.id ?? null);
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  async function saveProfile() {
    setSaving(true);
    try {
      // profile is a single "kind=profile" memory row; replace if it exists
      if (profileId) {
        await fetch("/api/ads/agent/memory", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: profileId }),
        });
      }
      if (profile.trim()) {
        const res = await fetch("/api/ads/agent/memory", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "profile", text: profile.trim() }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      showToast("✓ Bedrijfsprofiel opgeslagen — de agent gebruikt het vanaf nu");
      await load();
    } catch (e) {
      showToast(`✗ Opslaan mislukt: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function addFact() {
    const text = newFact.trim();
    if (!text) return;
    await fetch("/api/ads/agent/memory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "fact", text }),
    });
    setNewFact("");
    await load();
  }

  async function remove(id: string) {
    await fetch("/api/ads/agent/memory", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const facts = (memory ?? []).filter((m) => m.kind === "fact");
  const rules = (memory ?? []).filter((m) => m.kind === "rule");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-google" /> Bedrijfsprofiel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Alles over je zaak in één plaats: wat je doet, wat je verkoopt, voor wie, en waarom
            klanten kiezen voor jou. De agent gebruikt dit bij elke analyse, elk voorstel en
            elke AI-gegenereerde tekst.
          </p>
          <textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            rows={8}
            maxLength={5000}
            placeholder={"bv. QuickSolutions is een reparatie-, aan- en verkoopbedrijf voor slimme toestellen met een winkel in Gent. We herstellen smartphones, tablets, laptops en MacBooks zonder afspraak…"}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{profile.length}/5000</span>
            <Button size="sm" onClick={saveProfile} disabled={saving}>
              {saving ? "Opslaan…" : "Profiel opslaan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Feiten</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Korte feiten die de agent moet kennen (openingsuren, diensten, prijzen, uitzonderingen).
            Regels beheer je in de Agent-tab onder &quot;Geheugen &amp; regels&quot;.
          </p>
          {!memory ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              {facts.length > 0 && (
                <div className="space-y-2 mb-3">
                  {facts.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2">
                      <span className="flex-1">{m.text}</span>
                      <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400" aria-label="Verwijder">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFact()}
                  placeholder="bv. Gratis verzendlabel als de winkel te ver is"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  maxLength={500}
                />
                <Button size="sm" variant="outline" onClick={addFact} disabled={!newFact.trim()}>
                  <Plus className="h-4 w-4 mr-1" /> Voeg toe
                </Button>
              </div>
              {rules.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {rules.length} regel(s) actief — beheer ze in de Agent-tab.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Bidding: read-only strategy overview ───

interface BiddingRow {
  campaignId: string;
  campaignName: string;
  channelType: string;
  status: string;
  strategyType: string;
  strategyName: string | null;
  targetCpaMicros: number | null;
  targetRoas: number | null;
}

export function BiddingSection({ accountId }: { accountId: string }) {
  const [rows, setRows] = useState<BiddingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ads/bidding?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.details || d.error) : setRows(d.rows ?? [])))
      .catch((e) => setError(String(e)));
  }, [accountId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Crosshair className="h-5 w-5 text-google" /> Biedstrategieën
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Waar Google per campagne op stuurt. Alleen-lezen — strategieën wijzigen doe je bewust
          in Google Ads zelf, of via een agent-voorstel.
        </p>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>
        ) : !rows ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Campagne</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Strategie</th>
                  <th className="py-2 pr-3">Portfolio</th>
                  <th className="py-2 text-right">Doel</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.campaignId} className={`border-b border-border/50 ${r.status !== "ENABLED" ? "opacity-50" : ""}`}>
                    <td className="py-2 pr-3 font-medium">{r.campaignName}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.channelType}</td>
                    <td className="py-2 pr-3">{biddingTypeLabel(r.strategyType)}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.strategyName ?? "—"}</td>
                    <td className="py-2 text-right text-xs">
                      {r.targetCpaMicros ? `CPA ${eurMicros(r.targetCpaMicros)}` : r.targetRoas ? `ROAS ${r.targetRoas.toFixed(1)}` : "—"}
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

// ─── Locations: read-only geo targeting per campaign ───

interface LocationTarget { geoTargetConstant: string; name: string; bidModifier: number | null; status: string }
interface CampaignLocations { campaignId: string; campaignName: string; channelType: string; targets: LocationTarget[] }

export function LocationsSection({ accountId }: { accountId: string }) {
  const [rows, setRows] = useState<CampaignLocations[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ads/locations?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.details || d.error) : setRows(d.rows ?? [])))
      .catch((e) => setError(String(e)));
  }, [accountId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-google" /> Locaties per campagne
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Waar elke campagne advertenties toont. Alleen-lezen voorlopig — locaties wijzigen volgt
          als agent-voorstel zodra dit beeld klopt.
        </p>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>
        ) : !rows ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Geen locatie-targeting gevonden (of alles target het hele land).</p>
        ) : (
          <div className="space-y-3">
            {rows.map((c) => (
              <div key={c.campaignId} className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{c.campaignName}</p>
                  <Badge className="bg-muted/40 text-muted-foreground border-border">{c.channelType}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {c.targets.map((t) => (
                    <Badge key={t.geoTargetConstant} className="bg-google/10 text-google border-google/30">
                      {t.name}
                      {t.bidModifier && t.bidModifier !== 1 ? ` · ${t.bidModifier > 1 ? "+" : ""}${Math.round((t.bidModifier - 1) * 100)}%` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
