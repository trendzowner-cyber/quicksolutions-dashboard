"use client";

// ─── Create campaign wizard ───
// 3 steps: basics (name + budget + URL) → keywords → RSA ad copy.
// "Generate with AI" drafts keywords + headlines from the business profile.
// Saves as a pending proposal — nothing goes live without approval.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useAdsLang, type L } from "./i18n";

interface KeywordDraft { text: string; matchType: "EXACT" | "PHRASE" | "BROAD" }

const MATCH_TYPES = ["EXACT", "PHRASE", "BROAD"] as const;
const MATCH_LABELS: Record<string, L> = {
  EXACT: { nl: "Exact", en: "Exact" },
  PHRASE: { nl: "Zinsdeel", en: "Phrase" },
  BROAD: { nl: "Breed", en: "Broad" },
};

const CC = {
  newCampaign: { nl: "Nieuwe campagne", en: "New campaign" },
  wizardTitle: { nl: "Nieuwe campagne", en: "New campaign" },
  stepOf: { nl: "stap", en: "step" },
  of: { nl: "van", en: "of" },
  stepBasics: { nl: "Basis", en: "Basics" },
  stepKeywords: { nl: "Keywords", en: "Keywords" },
  stepAd: { nl: "Advertentie", en: "Ad" },
  campaignName: { nl: "Campagnenaam", en: "Campaign name" },
  namePh: { nl: "bv. Gent — iPhone reparatie", en: "e.g. Ghent — iPhone repair" },
  dailyBudget: { nl: "Dagbudget (€)", en: "Daily budget (€)" },
  landingUrl: { nl: "Landingspagina URL", en: "Landing page URL" },
  typeNote: { nl: "Type: Search · Start gepauzeerd · Handmatig CPC", en: "Type: Search · Starts paused · Manual CPC" },
  keywordsLabel: { nl: "Keywords", en: "Keywords" },
  aiDraft: { nl: "AI-concept", en: "AI draft" },
  keywordPh: { nl: "Typ keyword + Enter", en: "Type keyword + Enter" },
  needKeyword: { nl: "Voeg minstens 1 keyword toe of gebruik AI-concept.", en: "Add at least 1 keyword or use AI draft." },
  headlinesLabel: { nl: "Headlines", en: "Headlines" },
  maxChars30: { nl: "max 30 tekens", en: "max 30 chars" },
  headlinePh: { nl: "Headline + Enter", en: "Headline + Enter" },
  needHeadlines: { nl: "Minstens 3 headlines nodig", en: "At least 3 headlines needed" },
  descriptionsLabel: { nl: "Beschrijvingen", en: "Descriptions" },
  maxChars90: { nl: "max 90 tekens", en: "max 90 chars" },
  descPh: { nl: "Beschrijving + Enter", en: "Description + Enter" },
  needDescriptions: { nl: "Minstens 2 beschrijvingen nodig", en: "At least 2 descriptions needed" },
  previous: { nl: "Vorige", en: "Previous" },
  next: { nl: "Volgende", en: "Next" },
  creating: { nl: "Aanmaken…", en: "Creating…" },
  saveProposal: { nl: "Opslaan als voorstel", en: "Save as proposal" },
  aiGenerated: { nl: "✓ AI-concept gegenereerd — controleer en pas aan", en: "✓ AI draft generated — review and adjust" },
  aiFailed: { nl: "✗ AI-generatie mislukt", en: "✗ AI generation failed" },
  aiNoAnswer: { nl: "AI gaf geen bruikbaar antwoord", en: "AI returned no usable answer" },
  proposalCreated: { nl: "✓ Campagne-voorstel aangemaakt — keur goed in de Agent-tab", en: "✓ Campaign proposal created — approve it in the Agent tab" },
  proposalReasonTail: { nl: "Start gepauzeerd.", en: "Starts paused." },
} satisfies Record<string, L>;

export function CreateCampaignWizard({
  accountId,
  showToast,
  onCreated,
}: {
  accountId: string;
  showToast: (m: string) => void;
  onCreated?: () => void;
}) {
  const { lang } = useAdsLang();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [budgetEuros, setBudgetEuros] = useState("10");
  const [finalUrl, setFinalUrl] = useState("https://quicksolutionspro.be/");
  const [keywords, setKeywords] = useState<KeywordDraft[]>([]);
  const [kwInput, setKwInput] = useState("");
  const [headlines, setHeadlines] = useState<string[]>([]);
  const [headlineInput, setHeadlineInput] = useState("");
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [descInput, setDescInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const canNext = step === 0
    ? name.trim().length > 0 && Number(budgetEuros) >= 1 && finalUrl.startsWith("https://")
    : step === 1
      ? keywords.length > 0
      : headlines.length >= 3 && descriptions.length >= 2;

  function addKeyword() {
    const t = kwInput.trim().toLowerCase();
    if (t && !keywords.some((k) => k.text === t)) {
      setKeywords([...keywords, { text: t, matchType: "PHRASE" }]);
    }
    setKwInput("");
  }

  function addHeadline() {
    const t = headlineInput.trim().slice(0, 30);
    if (t && headlines.length < 15) setHeadlines([...headlines, t]);
    setHeadlineInput("");
  }

  function addDescription() {
    const t = descInput.trim().slice(0, 90);
    if (t && descriptions.length < 4) setDescriptions([...descriptions, t]);
    setDescInput("");
  }

  async function generateWithAI() {
    if (!name.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/ads/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: lang === "en"
            ? `Generate for a new Search campaign "${name}" (website: ${finalUrl}): 10 keywords (mix of exact/phrase), 8 headlines (max 30 chars), 3 descriptions (max 90 chars). Answer as JSON: {"keywords":[{"text":"...","matchType":"EXACT|PHRASE|BROAD"}],"headlines":["..."],"descriptions":["..."]}`
            : `Genereer voor een nieuwe Search-campagne "${name}" (website: ${finalUrl}): 10 keywords (mix van exact/phrase), 8 headlines (max 30 tekens), 3 beschrijvingen (max 90 tekens). Antwoord als JSON: {"keywords":[{"text":"...","matchType":"EXACT|PHRASE|BROAD"}],"headlines":["..."],"descriptions":["..."]}`,
          accountId,
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      // Parse the AI response from the chat answer
      const txt = data.assistantMessage?.content ?? "";
      const match = txt.match(/\{[\s\S]*"keywords"[\s\S]*\}/);
      if (!match) throw new Error(CC.aiNoAnswer[lang]);
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.keywords)) {
        setKeywords(parsed.keywords.slice(0, 15).map((k: { text?: string; matchType?: string }) => ({
          text: String(k.text ?? "").toLowerCase().slice(0, 80),
          matchType: MATCH_TYPES.includes(String(k.matchType ?? "").toUpperCase() as typeof MATCH_TYPES[number])
            ? String(k.matchType).toUpperCase() as typeof MATCH_TYPES[number] : "PHRASE" as const,
        })).filter((k: KeywordDraft) => k.text));
      }
      if (Array.isArray(parsed.headlines)) {
        setHeadlines(parsed.headlines.slice(0, 15).map((h: string) => String(h).slice(0, 30)).filter(Boolean));
      }
      if (Array.isArray(parsed.descriptions)) {
        setDescriptions(parsed.descriptions.slice(0, 4).map((d: string) => String(d).slice(0, 90)).filter(Boolean));
      }
      showToast(CC.aiGenerated[lang]);
    } catch (e) {
      showToast(`${CC.aiFailed[lang]}: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      const spec = {
        name: name.trim(),
        dailyBudgetMicros: Math.round(Number(budgetEuros) * 1e6),
        keywords,
        headlines,
        descriptions,
        finalUrl,
      };
      const res = await fetch("/api/ads/agent/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual: true,
          type: "create_campaign",
          title: lang === "en" ? `New campaign: ${spec.name}` : `Nieuwe campagne: ${spec.name}`,
          reason: `${keywords.length} keywords, ${headlines.length} headlines, €${budgetEuros}${lang === "en" ? "/day" : "/dag"}. ${CC.proposalReasonTail[lang]}`,
          payload: { customerId: accountId, spec },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      showToast(CC.proposalCreated[lang]);
      setOpen(false);
      setStep(0);
      setName(""); setKeywords([]); setHeadlines([]); setDescriptions([]);
      onCreated?.();
    } catch (e) {
      showToast(`✗ ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> {CC.newCampaign[lang]}
      </Button>
    );
  }

  const steps = [CC.stepBasics[lang], CC.stepKeywords[lang], CC.stepAd[lang]];

  return (
    <Card className="border-google/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">{CC.wizardTitle[lang]} — {CC.stepOf[lang]} {step + 1} {CC.of[lang]} 3</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step indicator */}
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full ${i <= step ? "bg-google" : "bg-border"}`} />
          ))}
        </div>

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{CC.campaignName[lang]}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={128}
                placeholder={CC.namePh[lang]}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{CC.dailyBudget[lang]}</label>
                <input type="number" min="1" max="500" value={budgetEuros} onChange={(e) => setBudgetEuros(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{CC.landingUrl[lang]}</label>
                <input value={finalUrl} onChange={(e) => setFinalUrl(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{CC.typeNote[lang]}</p>
          </div>
        )}

        {/* Step 1: Keywords */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">{CC.keywordsLabel[lang]} ({keywords.length})</label>
              <Button size="sm" variant="ghost" onClick={generateWithAI} disabled={generating || !name.trim()}>
                {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                {CC.aiDraft[lang]}
              </Button>
            </div>
            <div className="flex gap-2">
              <input value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                placeholder={CC.keywordPh[lang]}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((k, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs">
                  <select value={k.matchType} onChange={(e) => {
                    const next = [...keywords];
                    next[i] = { ...k, matchType: e.target.value as KeywordDraft["matchType"] };
                    setKeywords(next);
                  }} className="bg-transparent text-[10px] font-medium text-muted-foreground border-none outline-none">
                    {MATCH_TYPES.map((mt) => <option key={mt} value={mt}>{MATCH_LABELS[mt][lang]}</option>)}
                  </select>
                  {k.text}
                  <button onClick={() => setKeywords(keywords.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            {keywords.length === 0 && <p className="text-xs text-muted-foreground">{CC.needKeyword[lang]}</p>}
          </div>
        )}

        {/* Step 2: RSA ad */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">{CC.headlinesLabel[lang]} ({headlines.length}/15, {CC.maxChars30[lang]})</label>
                <Button size="sm" variant="ghost" onClick={generateWithAI} disabled={generating || !name.trim()}>
                  {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {CC.aiDraft[lang]}
                </Button>
              </div>
              <div className="flex gap-2 mb-2">
                <input value={headlineInput} onChange={(e) => setHeadlineInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addHeadline()}
                  placeholder={CC.headlinePh[lang]} maxLength={30}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                {headlines.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge className="bg-muted text-muted-foreground border border-border text-[10px] shrink-0">{h.length}</Badge>
                    <span className="flex-1 truncate">{h}</span>
                    <button onClick={() => setHeadlines(headlines.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
              {headlines.length < 3 && <p className="text-xs text-amber-600 dark:text-amber-400">{CC.needHeadlines[lang]} ({headlines.length}/3)</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{CC.descriptionsLabel[lang]} ({descriptions.length}/4, {CC.maxChars90[lang]})</label>
              <div className="flex gap-2 mt-2 mb-2">
                <input value={descInput} onChange={(e) => setDescInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addDescription()}
                  placeholder={CC.descPh[lang]} maxLength={90}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                {descriptions.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge className="bg-muted text-muted-foreground border border-border text-[10px] shrink-0">{d.length}</Badge>
                    <span className="flex-1 truncate">{d}</span>
                    <button onClick={() => setDescriptions(descriptions.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
              {descriptions.length < 2 && <p className="text-xs text-amber-600 dark:text-amber-400">{CC.needDescriptions[lang]} ({descriptions.length}/2)</p>}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {CC.previous[lang]}
          </Button>
          <span className="text-xs text-muted-foreground">{steps[step]}</span>
          {step < 2 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canNext}>
              {CC.next[lang]} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={submit} disabled={!canNext || saving}>
              {saving ? CC.creating[lang] : CC.saveProposal[lang]}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
