"use client";

// ─── Context, Bidding, Locations sections (Bavian parity) ───

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Plus, X, MapPin, Crosshair } from "lucide-react";
import { eurMicros } from "@/lib/format";
import { useAdsLang, type L, type AdsLang } from "./i18n";

const BIDDING_LABELS: Record<string, L> = {
  TARGET_SPEND: { nl: "Max. klikken (Target Spend)", en: "Max. clicks (Target Spend)" },
  MAXIMIZE_CONVERSIONS: { nl: "Max. conversies", en: "Max. conversions" },
  MAXIMIZE_CONVERSION_VALUE: { nl: "Max. conversiewaarde", en: "Max. conversion value" },
  TARGET_CPA: { nl: "Doel-CPA", en: "Target CPA" },
  TARGET_ROAS: { nl: "Doel-ROAS", en: "Target ROAS" },
  TARGET_IMPRESSION_SHARE: { nl: "Doel-vertoningsaandeel", en: "Target impression share" },
  MANUAL_CPC: { nl: "Handmatig CPC", en: "Manual CPC" },
  ENHANCED_CPC: { nl: "Verbeterde CPC", en: "Enhanced CPC" },
  TARGET_CPM: { nl: "Doel-CPM", en: "Target CPM" },
};

function biddingTypeLabel(t: string, lang: AdsLang): string {
  return BIDDING_LABELS[t]?.[lang] ?? t.replace(/_/g, " ").toLowerCase();
}

// ─── Context: business profile + facts + rules (feeds the agent's AI) ───

const CX = {
  profileTitle: { nl: "Bedrijfsprofiel", en: "Business profile" },
  profileDesc: {
    nl: "Alles over je zaak in één plaats: wat je doet, wat je verkoopt, voor wie, en waarom klanten kiezen voor jou. De agent gebruikt dit bij elke analyse, elk voorstel en elke AI-gegenereerde tekst.",
    en: "Everything about your business in one place: what you do, what you sell, for whom, and why customers choose you. The agent uses this in every analysis, proposal and AI-generated text.",
  },
  profilePh: {
    nl: "bv. QuickSolutions is een reparatie-, aan- en verkoopbedrijf voor slimme toestellen met een winkel in Gent. We herstellen smartphones, tablets, laptops en MacBooks zonder afspraak…",
    en: "e.g. QuickSolutions is a repair and sales business for smart devices with a shop in Ghent. We repair smartphones, tablets, laptops and MacBooks without appointment…",
  },
  saving: { nl: "Opslaan…", en: "Saving…" },
  saveProfile: { nl: "Profiel opslaan", en: "Save profile" },
  profileSaved: { nl: "✓ Bedrijfsprofiel opgeslagen — de agent gebruikt het vanaf nu", en: "✓ Business profile saved — the agent uses it from now on" },
  saveFailed: { nl: "✗ Opslaan mislukt", en: "✗ Save failed" },
  factsTitle: { nl: "Feiten", en: "Facts" },
  factsDesc: {
    nl: "Korte feiten die de agent moet kennen (openingsuren, diensten, prijzen, uitzonderingen). Regels beheer je in de Agent-tab onder \"Geheugen & regels\".",
    en: "Short facts the agent should know (opening hours, services, prices, exceptions). Rules are managed in the Agent tab under \"Memory & rules\".",
  },
  remove: { nl: "Verwijder", en: "Remove" },
  factPh: { nl: "bv. Gratis verzendlabel als de winkel te ver is", en: "e.g. Free shipping label if the shop is too far" },
  addFact: { nl: "Voeg toe", en: "Add" },
  rulesActive: { nl: "regel(s) actief — beheer ze in de Agent-tab.", en: "rule(s) active — manage them in the Agent tab." },
} satisfies Record<string, L>;

interface MemoryRow { id: string; kind: string; text: string; source: string }

export function ContextSection({ showToast }: { showToast: (m: string) => void }) {
  const { lang } = useAdsLang();
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
      showToast(CX.profileSaved[lang]);
      await load();
    } catch (e) {
      showToast(`${CX.saveFailed[lang]}: ${String(e)}`);
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
            <Brain className="h-5 w-5 text-google" /> {CX.profileTitle[lang]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">{CX.profileDesc[lang]}</p>
          <textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            rows={8}
            maxLength={5000}
            placeholder={CX.profilePh[lang]}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{profile.length}/5000</span>
            <Button size="sm" onClick={saveProfile} disabled={saving}>
              {saving ? CX.saving[lang] : CX.saveProfile[lang]}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{CX.factsTitle[lang]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{CX.factsDesc[lang]}</p>
          {!memory ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              {facts.length > 0 && (
                <div className="space-y-2 mb-3">
                  {facts.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2">
                      <span className="flex-1">{m.text}</span>
                      <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400" aria-label={CX.remove[lang]}>
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
                  placeholder={CX.factPh[lang]}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  maxLength={500}
                />
                <Button size="sm" variant="outline" onClick={addFact} disabled={!newFact.trim()}>
                  <Plus className="h-4 w-4 mr-1" /> {CX.addFact[lang]}
                </Button>
              </div>
              {rules.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {rules.length} {CX.rulesActive[lang]}
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

const BD = {
  title: { nl: "Biedstrategieën", en: "Bidding strategies" },
  desc: {
    nl: "Waar Google per campagne op stuurt. Alleen-lezen — strategieën wijzigen doe je bewust in Google Ads zelf, of via een agent-voorstel.",
    en: "What Google optimises for per campaign. Read-only — change strategies deliberately in Google Ads itself, or via an agent proposal.",
  },
  campaign: { nl: "Campagne", en: "Campaign" },
  type: { nl: "Type", en: "Type" },
  strategy: { nl: "Strategie", en: "Strategy" },
  portfolio: { nl: "Portfolio", en: "Portfolio" },
  target: { nl: "Doel", en: "Target" },
} satisfies Record<string, L>;

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
  const { lang } = useAdsLang();
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
          <Crosshair className="h-5 w-5 text-google" /> {BD.title[lang]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">{BD.desc[lang]}</p>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>
        ) : !rows ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">{BD.campaign[lang]}</th>
                  <th className="py-2 pr-3">{BD.type[lang]}</th>
                  <th className="py-2 pr-3">{BD.strategy[lang]}</th>
                  <th className="py-2 pr-3">{BD.portfolio[lang]}</th>
                  <th className="py-2 text-right">{BD.target[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.campaignId} className={`border-b border-border/50 ${r.status !== "ENABLED" ? "opacity-50" : ""}`}>
                    <td className="py-2 pr-3 font-medium">{r.campaignName}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{r.channelType}</td>
                    <td className="py-2 pr-3">{biddingTypeLabel(r.strategyType, lang)}</td>
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

const LC = {
  title: { nl: "Locaties per campagne", en: "Locations per campaign" },
  desc: {
    nl: "Waar elke campagne advertenties toont. Alleen-lezen voorlopig — locaties wijzigen volgt als agent-voorstel zodra dit beeld klopt.",
    en: "Where each campaign shows ads. Read-only for now — changing locations will follow as an agent proposal once this view is correct.",
  },
  empty: { nl: "Geen locatie-targeting gevonden (of alles target het hele land).", en: "No location targeting found (or everything targets the whole country)." },
} satisfies Record<string, L>;

interface LocationTarget { geoTargetConstant: string; name: string; bidModifier: number | null; status: string }
interface CampaignLocations { campaignId: string; campaignName: string; channelType: string; targets: LocationTarget[] }

export function LocationsSection({ accountId }: { accountId: string }) {
  const { lang } = useAdsLang();
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
          <MapPin className="h-5 w-5 text-google" /> {LC.title[lang]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">{LC.desc[lang]}</p>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>
        ) : !rows ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{LC.empty[lang]}</p>
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
