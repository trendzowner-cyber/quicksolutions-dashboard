"use client";

// ─── Budget tab — Bavian's total-cap + AI allocation ───
// One daily ceiling across all campaigns. The AI distributes it per campaign
// based on performance + memory rules. Strategy text saves as a memory rule.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Sparkles, RefreshCw } from "lucide-react";
import { eur } from "./search-terms-section";
import { useAdsLang, type L } from "./i18n";

const BS = {
  capTitle: { nl: "Totaal dagbudget", en: "Total daily budget" },
  capDesc: {
    nl: "Eén plafond voor alle campagnes samen. De agent verdeelt dit over je campagnes op basis van prestaties — jij keurt elke wijziging goed.",
    en: "One ceiling across all campaigns. The agent distributes it over your campaigns based on performance — you approve every change.",
  },
  perDay: { nl: "per dag", en: "per day" },
  perDaySuffix: { nl: "/dag", en: "/day" },
  saving: { nl: "Opslaan…", en: "Saving…" },
  save: { nl: "Opslaan", en: "Save" },
  capSaved: { nl: "✓ Dagbudget-plafond", en: "✓ Daily budget ceiling" },
  allocating: { nl: "AI verdeelt…", en: "AI is allocating…" },
  allocate: { nl: "Verdeel met AI", en: "Allocate with AI" },
  proposalsCreated: { nl: "budget-voorstellen aangemaakt — keur ze goed in de Agent-tab", en: "budget proposals created — approve them in the Agent tab" },
  allOptimal: { nl: "✓ Alles al optimaal verdeeld", en: "✓ Everything already optimally allocated" },
  saveFailed: { nl: "Opslaan mislukt", en: "Save failed" },
  strategySaved: { nl: "✓ Budgetstrategie opgeslagen — de agent volgt deze nu", en: "✓ Budget strategy saved — the agent now follows it" },
  strategyTitle: { nl: "Hoe wil je dat het budget wordt besteed?", en: "How do you want the budget to be spent?" },
  strategyDesc: {
    nl: "Bijvoorbeeld: \"Prioriteit op Gent en Aalst\", \"Max €20/dag op de Overig-campagne\", \"Meer naar Macbook-reparaties, minder naar schermen\". De agent volgt dit bij elke verdeling.",
    en: "For example: \"Priority on Ghent and Aalst\", \"Max €20/day on the Other campaign\", \"More towards MacBook repairs, less towards screens\". The agent follows this in every allocation.",
  },
  strategyPh: { nl: "Typ je budgetstrategie…", en: "Type your budget strategy…" },
  saveRule: { nl: "Sla op als regel", en: "Save as rule" },
} satisfies Record<string, L>;

export function BudgetSection({
  accountId,
  showToast,
  onProposalsChanged,
}: {
  accountId: string;
  showToast: (m: string) => void;
  onProposalsChanged?: () => void;
}) {
  const { lang } = useAdsLang();
  const [capEuros, setCapEuros] = useState<string>("");
  const [savedCap, setSavedCap] = useState<number | null>(null);
  const [strategy, setStrategy] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allocating, setAllocating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ads/budget");
      const data = await res.json();
      setSavedCap(data.capEuros);
      if (data.capEuros != null) setCapEuros(String(data.capEuros));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveCap() {
    const val = Number(capEuros);
    if (!Number.isFinite(val) || val <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ads/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capEuros: val }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setSavedCap(data.capEuros);
      showToast(`${BS.capSaved[lang]}: €${val.toFixed(0)}${BS.perDaySuffix[lang]}`);
    } catch (e) {
      showToast(`✗ ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveStrategy() {
    if (!strategy.trim()) return;
    try {
      const res = await fetch("/api/ads/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: strategy.trim() }),
      });
      if (!res.ok) throw new Error(BS.saveFailed[lang]);
      setStrategy("");
      showToast(BS.strategySaved[lang]);
    } catch (e) {
      showToast(`✗ ${String(e)}`);
    }
  }

  async function allocate() {
    setAllocating(true);
    try {
      const res = await fetch("/api/ads/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocate: true, accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      const n = data.allocation?.length ?? 0;
      showToast(n ? `✓ ${n} ${BS.proposalsCreated[lang]}` : BS.allOptimal[lang]);
      onProposalsChanged?.();
    } catch (e) {
      showToast(`✗ ${String(e)}`);
    } finally {
      setAllocating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Total daily cap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-google" /> {BS.capTitle[lang]}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{BS.capDesc[lang]}</p>
          {loading ? (
            <Skeleton className="h-10 w-48" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={capEuros}
                  onChange={(e) => setCapEuros(e.target.value)}
                  placeholder="500"
                  className="w-36 rounded-md border border-border bg-background pl-7 pr-3 py-2 text-sm"
                />
              </div>
              <span className="text-sm text-muted-foreground">{BS.perDay[lang]}</span>
              <Button size="sm" onClick={saveCap} disabled={saving || !capEuros.trim()}>
                {saving ? BS.saving[lang] : BS.save[lang]}
              </Button>
            </div>
          )}
          {savedCap != null && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-google/10 border border-google/30 px-4 py-2">
                <p className="text-lg font-bold text-google">{eur(savedCap)}<span className="text-sm font-normal text-muted-foreground">{BS.perDaySuffix[lang]}</span></p>
              </div>
              <Button size="sm" variant="outline" onClick={allocate} disabled={allocating}>
                {allocating ? (
                  <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> {BS.allocating[lang]}</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1" /> {BS.allocate[lang]}</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy → memory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{BS.strategyTitle[lang]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{BS.strategyDesc[lang]}</p>
          <textarea
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            placeholder={BS.strategyPh[lang]}
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button size="sm" variant="outline" onClick={saveStrategy} disabled={!strategy.trim()}>
            {BS.saveRule[lang]}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
