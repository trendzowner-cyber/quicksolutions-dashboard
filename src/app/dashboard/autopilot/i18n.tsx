"use client";

// ─── Google Ads section language (NL / EN) ───
// Simple client-side i18n: a provider holding "nl" | "en", persisted to
// localStorage. Every component in the autopilot section reads the language
// via useAdsLang() and renders per-string pairs: S.title[lang].
// AI-generated content (proposal titles, reasons, memory) is stored data and
// is NOT translated; the chat agent answers in the selected language.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AdsLang = "nl" | "en";

const LangContext = createContext<{ lang: AdsLang; setLang: (l: AdsLang) => void }>({
  lang: "nl",
  setLang: () => {},
});

const STORAGE_KEY = "qs-ads-lang";

export function AdsLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AdsLang>("nl");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "nl") setLangState(saved);
    } catch { /* private mode etc. */ }
  }, []);

  function setLang(l: AdsLang) {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useAdsLang() {
  return useContext(LangContext);
}

/** Small NL/EN toggle for the header. */
export function LangToggle() {
  const { lang, setLang } = useAdsLang();
  return (
    <div className="flex items-center rounded-md border border-border overflow-hidden text-xs font-medium">
      {(["nl", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2.5 py-1.5 uppercase transition-colors ${
            lang === l ? "bg-google text-google-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** A translatable string pair. */
export type L = { nl: string; en: string };

/** Shared strings used across many components. */
export const C = {
  save: { nl: "Opslaan", en: "Save" },
  cancel: { nl: "Annuleren", en: "Cancel" },
  close: { nl: "Sluiten", en: "Close" },
  loading: { nl: "Laden…", en: "Loading…" },
  error: { nl: "Fout", en: "Error" },
  retry: { nl: "Opnieuw proberen", en: "Retry" },
  previous: { nl: "‹ Vorige", en: "‹ Previous" },
  next: { nl: "Volgende ›", en: "Next ›" },
  page: { nl: "Pagina", en: "Page" },
  of: { nl: "van", en: "of" },
  active: { nl: "Actief", en: "Active" },
  paused: { nl: "Gepauzeerd", en: "Paused" },
  all: { nl: "Alles", en: "All" },
  day: { nl: "dag", en: "day" },
  perDay: { nl: "/dag", en: "/day" },
  costs: { nl: "Kosten", en: "Cost" },
  clicks: { nl: "Kliks", en: "Clicks" },
  impressions: { nl: "Impr.", en: "Impr." },
  conversions: { nl: "Conversies", en: "Conversions" },
  conv: { nl: "Conv.", en: "Conv." },
  campaign: { nl: "Campagne", en: "Campaign" },
  campaigns: { nl: "Campagnes", en: "Campaigns" },
  adGroup: { nl: "Adgroep", en: "Ad group" },
  none: { nl: "Geen", en: "None" },
  yes: { nl: "Ja", en: "Yes" },
  no: { nl: "Nee", en: "No" },
  remove: { nl: "Verwijderen", en: "Remove" },
  add: { nl: "Voeg toe", en: "Add" },
  unknownError: { nl: "Onbekende fout", en: "Unknown error" },
} as const;
