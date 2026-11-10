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

export function BudgetSection({
  accountId,
  showToast,
  onProposalsChanged,
}: {
  accountId: string;
  showToast: (m: string) => void;
  onProposalsChanged?: () => void;
}) {
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
      showToast(`✓ Dagbudget-plafond: €${val.toFixed(0)}/dag`);
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
      if (!res.ok) throw new Error("Opslaan mislukt");
      setStrategy("");
      showToast("✓ Budgetstrategie opgeslagen — de agent volgt deze nu");
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
      showToast(n ? `✓ ${n} budget-voorstellen aangemaakt — keur ze goed in de Agent-tab` : "✓ Alles al optimaal verdeeld");
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
            <Wallet className="h-5 w-5 text-google" /> Totaal dagbudget
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Eén plafond voor alle campagnes samen. De agent verdeelt dit over je campagnes
            op basis van prestaties — jij keurt elke wijziging goed.
          </p>
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
              <span className="text-sm text-muted-foreground">per dag</span>
              <Button size="sm" onClick={saveCap} disabled={saving || !capEuros.trim()}>
                {saving ? "Opslaan…" : "Opslaan"}
              </Button>
            </div>
          )}
          {savedCap != null && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-google/10 border border-google/30 px-4 py-2">
                <p className="text-lg font-bold text-google">{eur(savedCap)}<span className="text-sm font-normal text-muted-foreground">/dag</span></p>
              </div>
              <Button size="sm" variant="outline" onClick={allocate} disabled={allocating}>
                {allocating ? (
                  <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> AI verdeelt…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1" /> Verdeel met AI</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy → memory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hoe wil je dat het budget wordt besteed?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Bijvoorbeeld: &quot;Prioriteit op Gent en Aalst&quot;, &quot;Max €20/dag op de Overig-campagne&quot;,
            &quot;Meer naar Macbook-reparaties, minder naar schermen&quot;. De agent volgt dit bij elke verdeling.
          </p>
          <textarea
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            placeholder="Typ je budgetstrategie…"
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button size="sm" variant="outline" onClick={saveStrategy} disabled={!strategy.trim()}>
            Sla op als regel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
