"use client";

// ─── Assets editor — sitelinks & callouts per campaign (Bavian parity) ───
// Reads the live set, edits are saved straight to Google Ads via the
// session-gated /api/ads/assets route (each save lands in AuditLog).

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Megaphone, Plus, Sparkles, Trash2 } from "lucide-react";
import { useAdsLang, type L } from "./i18n";

const AS = {
  extensionsTitle: { nl: "Extensies per campagne", en: "Extensions per campaign" },
  extensionsDesc: { nl: "Sitelinks en callouts onder je advertenties. Aanpassen slaat direct op naar Google Ads.", en: "Sitelinks and callouts below your ads. Changes are saved straight to Google Ads." },
  aiWriting: { nl: "AI schrijft…", en: "AI is writing…" },
  generateAi: { nl: "Genereer met AI", en: "Generate with AI" },
  draftsTitle: { nl: "AI-concepten — klik om op te slaan", en: "AI drafts — click to save" },
  close: { nl: "Sluiten", en: "Close" },
  sitelinks: { nl: "Sitelinks", en: "Sitelinks" },
  removeSitelink: { nl: "Verwijder sitelink", en: "Remove sitelink" },
  linkTextPh: { nl: "Linktekst (max 25)", en: "Link text (max 25)" },
  desc1Ph: { nl: "Beschrijving 1 (optioneel, max 35)", en: "Description 1 (optional, max 35)" },
  desc2Ph: { nl: "Beschrijving 2 (optioneel, max 35)", en: "Description 2 (optional, max 35)" },
  addSitelink: { nl: "Sitelink toevoegen", en: "Add sitelink" },
  callouts: { nl: "Callouts", en: "Callouts" },
  removeCallout: { nl: "Verwijder callout", en: "Remove callout" },
  noCallouts: { nl: "Nog geen callouts.", en: "No callouts yet." },
  calloutPh: { nl: "bv. Zonder afspraak (max 25)", en: "e.g. No appointment needed (max 25)" },
  add: { nl: "Toevoegen", en: "Add" },
  newConversion: { nl: "Nieuwe conversie meten", en: "Track a new conversion" },
  conversionDesc: { nl: "Maakt een conversieactie aan in Google Ads. Dit start alleen de meting — het verandert niets aan biedingen. De tag-code vind je daarna in de Conversies-tab.", en: "Creates a conversion action in Google Ads. This only starts measurement — it does not change any bids. You'll find the tag code in the Conversions tab afterwards." },
  convNamePh: { nl: "Naam, bv. Webshop aankoop", en: "Name, e.g. Webshop purchase" },
  catPurchase: { nl: "Aankoop", en: "Purchase" },
  catLeadForm: { nl: "Leadformulier", en: "Lead form" },
  catAppointment: { nl: "Afspraak", en: "Appointment" },
  catContact: { nl: "Contact", en: "Contact" },
  catPageView: { nl: "Paginaweergave", en: "Page view" },
  catOther: { nl: "Overig", en: "Other" },
  convValuePh: { nl: "Waarde in € (optioneel)", en: "Value in € (optional)" },
  createConversion: { nl: "Conversie aanmaken", en: "Create conversion" },
} satisfies Record<string, L>;

interface Sitelink { campaignAssetRn: string; linkText: string; description1: string; description2: string; finalUrl: string }
interface Callout { campaignAssetRn: string; text: string }
interface CampaignAssets { campaignId: string; campaignName: string; sitelinks: Sitelink[]; callouts: Callout[] }

interface Drafts {
  sitelinks: { linkText: string; description1: string; description2: string }[];
  callouts: string[];
}

export function AssetsSection({
  accountId,
  showToast,
}: {
  accountId: string;
  showToast: (m: string) => void;
}) {
  const { lang } = useAdsLang();
  const [rows, setRows] = useState<CampaignAssets[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [newSitelink, setNewSitelink] = useState({ linkText: "", description1: "", description2: "", finalUrl: "" });
  const [newCallout, setNewCallout] = useState("");
  const [convName, setConvName] = useState("");
  const [convCategory, setConvCategory] = useState("PURCHASE");
  const [convValue, setConvValue] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/ads/assets?accountId=${accountId}`).then((r) => r.json());
    if (res.error) setError(res.details || res.error);
    else {
      setRows(res.rows ?? []);
      if (!selectedCampaign && res.rows?.length) setSelectedCampaign(res.rows[0].campaignId);
    }
  }, [accountId, selectedCampaign]);

  useEffect(() => { load().catch((e) => setError(String(e))); }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/ads/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: accountId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      if (data.summary) showToast(`✓ ${data.summary}`);
      await load();
      return data;
    } catch (e) {
      showToast(`✗ ${String(e)}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const current = rows?.find((r) => r.campaignId === selectedCampaign) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{AS.extensionsTitle[lang]}</p>
            <p className="text-sm text-muted-foreground">
              {AS.extensionsDesc[lang]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm max-w-72"
            >
              {(rows ?? []).map((r) => (
                <option key={r.campaignId} value={r.campaignId}>{r.campaignName}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={generating || !current}
              onClick={async () => {
                setGenerating(true);
                const data = await post({ type: "generate_drafts" });
                setGenerating(false);
                if (data?.drafts) setDrafts(data.drafts);
              }}
            >
              <Sparkles className={`h-4 w-4 mr-1 ${generating ? "animate-pulse" : ""}`} />
              {generating ? AS.aiWriting[lang] : AS.generateAi[lang]}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!rows && !error && <Skeleton className="h-40 w-full" />}

      {/* AI drafts — review before saving */}
      {drafts && current && (
        <Card className="border-google/30 bg-google/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-google" /> {AS.draftsTitle[lang]}</span>
              <Button size="sm" variant="ghost" onClick={() => setDrafts(null)}>{AS.close[lang]}</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {drafts.sitelinks.map((s, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    await post({
                      type: "add_sitelink",
                      campaignId: current.campaignId,
                      linkText: s.linkText,
                      description1: s.description1,
                      description2: s.description2,
                      finalUrl: `https://www.quicksolutions.be/`,
                    });
                  }}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" /> {s.linkText}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {drafts.callouts.map((c, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => post({ type: "add_callout", campaignId: current.campaignId, text: c })}
                >
                  <Megaphone className="h-3.5 w-3.5 mr-1" /> {c}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {current && (
        <>
          {/* Sitelinks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-google" /> {AS.sitelinks[lang]} ({current.sitelinks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {current.sitelinks.map((s) => (
                <div key={s.campaignAssetRn} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{s.linkText}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.finalUrl}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => post({ type: "remove_asset", campaignAssetRn: s.campaignAssetRn, label: s.linkText })}
                    className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                    aria-label={AS.removeSitelink[lang]}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                <input
                  value={newSitelink.linkText}
                  onChange={(e) => setNewSitelink({ ...newSitelink, linkText: e.target.value })}
                  placeholder={AS.linkTextPh[lang]}
                  maxLength={25}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={newSitelink.finalUrl}
                  onChange={(e) => setNewSitelink({ ...newSitelink, finalUrl: e.target.value })}
                  placeholder="https://…"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={newSitelink.description1}
                  onChange={(e) => setNewSitelink({ ...newSitelink, description1: e.target.value })}
                  placeholder={AS.desc1Ph[lang]}
                  maxLength={35}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  value={newSitelink.description2}
                  onChange={(e) => setNewSitelink({ ...newSitelink, description2: e.target.value })}
                  placeholder={AS.desc2Ph[lang]}
                  maxLength={35}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !newSitelink.linkText.trim() || !newSitelink.finalUrl.trim()}
                onClick={async () => {
                  await post({ type: "add_sitelink", campaignId: current.campaignId, ...newSitelink });
                  setNewSitelink({ linkText: "", description1: "", description2: "", finalUrl: "" });
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> {AS.addSitelink[lang]}
              </Button>
            </CardContent>
          </Card>

          {/* Callouts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-google" /> {AS.callouts[lang]} ({current.callouts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {current.callouts.map((c) => (
                  <span key={c.campaignAssetRn} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                    {c.text}
                    <button
                      disabled={busy}
                      onClick={() => post({ type: "remove_asset", campaignAssetRn: c.campaignAssetRn, label: c.text })}
                      className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                      aria-label={AS.removeCallout[lang]}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {!current.callouts.length && (
                  <p className="text-sm text-muted-foreground">{AS.noCallouts[lang]}</p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={newCallout}
                  onChange={(e) => setNewCallout(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newCallout.trim() && post({ type: "add_callout", campaignId: current.campaignId, text: newCallout.trim() }).then(() => setNewCallout(""))}
                  placeholder={AS.calloutPh[lang]}
                  maxLength={25}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !newCallout.trim()}
                  onClick={async () => {
                    await post({ type: "add_callout", campaignId: current.campaignId, text: newCallout.trim() });
                    setNewCallout("");
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> {AS.add[lang]}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Conversion wizard (Bavian: "Track a new conversion") */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{AS.newConversion[lang]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            {AS.conversionDesc[lang]}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={convName}
              onChange={(e) => setConvName(e.target.value)}
              placeholder={AS.convNamePh[lang]}
              maxLength={100}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={convCategory}
              onChange={(e) => setConvCategory(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="PURCHASE">{AS.catPurchase[lang]}</option>
              <option value="SUBMIT_LEAD_FORM">{AS.catLeadForm[lang]}</option>
              <option value="BOOK_APPOINTMENT">{AS.catAppointment[lang]}</option>
              <option value="CONTACT">{AS.catContact[lang]}</option>
              <option value="PAGE_VIEW">{AS.catPageView[lang]}</option>
              <option value="DEFAULT">{AS.catOther[lang]}</option>
            </select>
            <input
              value={convValue}
              onChange={(e) => setConvValue(e.target.value)}
              placeholder={AS.convValuePh[lang]}
              inputMode="decimal"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button
            size="sm"
            className="mt-3"
            disabled={busy || !convName.trim()}
            onClick={async () => {
              await post({
                type: "create_conversion",
                name: convName.trim(),
                category: convCategory,
                valueEur: convValue ? Number(convValue.replace(",", ".")) : null,
              });
              setConvName("");
              setConvValue("");
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> {AS.createConversion[lang]}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
