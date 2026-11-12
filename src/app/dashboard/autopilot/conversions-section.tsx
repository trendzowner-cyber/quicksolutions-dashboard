"use client";

// ─── Conversion tracking inventory + install snippets ───
// Read-only: what is measured, how it counts, and the exact tag code.
// Creating conversions is a write into Google Ads — deliberately not built
// (the audit already flags tracking problems; fixing is a Google Ads click).

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check } from "lucide-react";
import { useAdsLang, type L } from "./i18n";

const ACCOUNT_ID = "668-709-2345";

interface ConversionActionRow {
  id: string;
  name: string;
  category: string;
  status: string;
  primaryForGoal: boolean;
  countingType: string;
  defaultValue: number | null;
  globalSiteTag: string | null;
  eventSnippet: string | null;
}

const CATEGORY_LABEL: Record<string, L> = {
  PURCHASE: { nl: "Aankoop", en: "Purchase" },
  CONTACT: { nl: "Contact", en: "Contact" },
  LEAD: { nl: "Lead", en: "Lead" },
  SIGNUP: { nl: "Aanmelding", en: "Sign-up" },
  PAGE_VIEW: { nl: "Paginaweergave", en: "Page view" },
  PHONE_CALL_LEAD: { nl: "Telefoongesprek", en: "Phone call" },
  SUBMIT_LEAD_FORM: { nl: "Leadformulier", en: "Lead form" },
  BOOK_APPOINTMENT: { nl: "Afspraak", en: "Appointment" },
  DEFAULT: { nl: "Standaard", en: "Default" },
};

const CV = {
  title: { nl: "Conversiemeting", en: "Conversion tracking" },
  intro: {
    nl: "Wat je account meet en hoe. \"Primair\" telt mee voor biedstrategie-optimalisatie; secundair is alleen rapportage. Aanmaken/wijzigen doe je in Google Ads zelf — dit scherm is bewust alleen-lezen.",
    en: "What your account measures and how. \"Primary\" counts towards bid-strategy optimisation; secondary is reporting only. Creating/changing is done in Google Ads itself — this screen is deliberately read-only.",
  },
  empty: { nl: "Geen conversie-acties gevonden.", en: "No conversion actions found." },
  primary: { nl: "Primair", en: "Primary" },
  active: { nl: "Actief", en: "Active" },
  onePerClick: { nl: "1× per klik", en: "1× per click" },
  everyClick: { nl: "elke klik", en: "every click" },
  defaultValueNote: { nl: "standaardwaarde", en: "default value" },
  defaultValueOnly: { nl: "(geldt alleen als de site geen bedrag meestuurt)", en: "(only applies when the site does not send a value)" },
  globalTagLabel: { nl: "Google tag (op elke pagina van de site)", en: "Google tag (on every page of the site)" },
  noSnippet: { nl: "Geen tag-snippet beschikbaar via de API voor deze actie — haal de code op in Google Ads → Conversies →", en: "No tag snippet available via the API for this action — get the code in Google Ads → Conversions →" },
  eventSnippetLabel: { nl: "Event snippet (alleen op de actie: klik, formulier, bedankpagina)", en: "Event snippet (only on the action: click, form, thank-you page)" },
} satisfies Record<string, L>;

function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button
          size="sm" variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
        {code}
      </pre>
    </div>
  );
}

export function ConversionsSection() {
  const { lang } = useAdsLang();
  const [conversions, setConversions] = useState<ConversionActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/ads/conversions?accountId=${ACCOUNT_ID}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.details || data.error);
        setConversions(data.conversions ?? []);
      } catch (e) {
        setError(String(e));
        setConversions([]);
      }
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{CV.title[lang]} ({conversions?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">{CV.intro[lang]}</p>
        {error && <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>}
        {!conversions ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !conversions.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{CV.empty[lang]}</p>
        ) : (
          <div className="space-y-2">
            {conversions.map((c) => {
              const isOpen = open === c.id;
              return (
                <div key={c.id} className="rounded-lg border border-border">
                  <button
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/20"
                  >
                    <span className="font-medium flex-1 min-w-0 truncate">{c.name}</span>
                    <Badge className="bg-muted/40 text-muted-foreground border-border">
                      {CATEGORY_LABEL[c.category]?.[lang] ?? c.category}
                    </Badge>
                    {c.primaryForGoal && (
                      <Badge className="bg-brand/15 text-brand border-brand/30">{CV.primary[lang]}</Badge>
                    )}
                    <Badge className={c.status === "ENABLED"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-muted/40 text-muted-foreground border-border"}>
                      {c.status === "ENABLED" ? CV.active[lang] : c.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {c.countingType === "ONE_PER_CLICK" ? CV.onePerClick[lang] : c.countingType === "MANY_PER_CLICK" ? CV.everyClick[lang] : c.countingType}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border px-4 py-4 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        ID {c.id}
                        {c.defaultValue !== null && ` · ${CV.defaultValueNote[lang]} €${c.defaultValue} ${CV.defaultValueOnly[lang]}`}
                      </p>
                      {c.globalSiteTag ? (
                        <CopyBlock code={c.globalSiteTag} label={CV.globalTagLabel[lang]} />
                      ) : (
                        <p className="text-xs text-muted-foreground">{CV.noSnippet[lang]} {c.name}.</p>
                      )}
                      {c.eventSnippet && (
                        <CopyBlock code={c.eventSnippet} label={CV.eventSnippetLabel[lang]} />
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
