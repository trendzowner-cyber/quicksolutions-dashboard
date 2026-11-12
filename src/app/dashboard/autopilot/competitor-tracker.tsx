"use client";

// ─── Competitor ad tracker (Google Ads Transparency Center) ───
// Track any domain; the dashboard pulls their live EU creatives daily and
// shows the actual rendered ad — including text/search ads, which Google
// renders as an image (the piece Bavian's UI is missing).

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Plus, RefreshCw, Trash2, ExternalLink, ImageOff } from "lucide-react";
import { dateShort } from "@/lib/format";
import { useAdsLang, type L } from "./i18n";

interface TrackedAd {
  id: string;
  creativeId: string;
  format: string;
  previewUrl: string | null;
  link: string;
  advertiser: string;
  firstShown: string | null;
  lastShown: string | null;
  firstSeenAt: string;
  baseline: boolean;
}

interface TrackedCompetitor {
  id: string;
  domain: string;
  name: string | null;
  adCount: number;
  lastSyncedAt: string | null;
  ads: TrackedAd[];
}

const FORMAT_STYLE: Record<string, { label: L; cls: string }> = {
  text: { label: { nl: "Tekst", en: "Text" }, cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  image: { label: { nl: "Beeld", en: "Image" }, cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  video: { label: { nl: "Video", en: "Video" }, cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  unknown: { label: { nl: "?", en: "?" }, cls: "bg-muted/40 text-muted-foreground border-border" },
};

const CT = {
  title: { nl: "Live advertenties van concurrenten", en: "Live competitor ads" },
  description: {
    nl: "Plak het domein van een concurrent — wij lezen dagelijks hun lopende Google-advertenties uit het Ads Transparency Center (regio België), mét echte preview. Nieuwe advertenties krijg je automatisch via Telegram.",
    en: "Paste a competitor's domain — we read their live Google ads daily from the Ads Transparency Center (Belgium region), with real previews. New ads are sent to you automatically via Telegram.",
  },
  placeholder: { nl: "concurrent-domein.be", en: "competitor-domain.com" },
  searching: { nl: "Zoeken…", en: "Searching…" },
  follow: { nl: "Volg", en: "Track" },
  empty: {
    nl: "Nog geen concurrenten gevolgd. Probeer bijvoorbeeld het domein van een reparatiezaak in Gent.",
    en: "No competitors tracked yet. Try the domain of a repair shop in Ghent, for example.",
  },
  notSynced: { nl: "Nog niet gesynchroniseerd", en: "Not synced yet" },
  lastSync: { nl: "Laatste sync", en: "Last sync" },
  hide: { nl: "Verberg", en: "Hide" },
  showAds: { nl: "Toon ads", en: "Show ads" },
  syncNow: { nl: "Nu synchroniseren", en: "Sync now" },
  stopTracking: { nl: "Stop met volgen", en: "Stop tracking" },
  newBadge: { nl: "nieuw", en: "new" },
  noAds: { nl: "Geen advertenties opgeslagen.", en: "No ads stored." },
  noPreview: { nl: "Geen preview — open bij Google", en: "No preview — open in Google" },
  until: { nl: "t/m", en: "until" },
  showMore: { nl: "Toon meer", en: "Show more" },
  of: { nl: "van", en: "of" },
  adsFound: { nl: "advertenties gevonden", en: "ads found" },
  newAds: { nl: "nieuwe advertenties", en: "new ads" },
  noNewAds: { nl: "geen nieuwe advertenties", en: "no new ads" },
  removeFailed: { nl: "Verwijderen mislukt", en: "Remove failed" },
  removed: { nl: "verwijderd", en: "removed" },
} satisfies Record<string, L>;

const NEW_WINDOW_MS = 48 * 3600 * 1000;

function isNew(ad: TrackedAd): boolean {
  // Baseline ads came in with the first import — they are not "new", even
  // though their firstSeenAt is recent by definition.
  return !ad.baseline && Date.now() - new Date(ad.firstSeenAt).getTime() < NEW_WINDOW_MS;
}

function proxied(url: string): string {
  return `/api/ads/creative-preview?url=${encodeURIComponent(url)}`;
}

export function CompetitorTracker({ showToast }: { showToast: (m: string) => void }) {
  const { lang } = useAdsLang();
  const [competitors, setCompetitors] = useState<TrackedCompetitor[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyDomain, setBusyDomain] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shownCounts, setShownCounts] = useState<Record<string, number>>({});
  const [brokenPreviews, setBrokenPreviews] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ads/competitors");
      const data = await res.json();
      setCompetitors(data.competitors ?? []);
    } catch {
      setCompetitors([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addCompetitor(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/ads/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      showToast(`✓ ${data.competitor.name ?? data.competitor.domain}: ${data.stored} ${CT.adsFound[lang]}`);
      setQuery("");
      setExpanded((prev) => new Set(prev).add(data.competitor.domain));
      await load();
    } catch (err) {
      showToast(`✗ ${String(err)}`);
    } finally {
      setAdding(false);
    }
  }

  async function refresh(domain: string) {
    setBusyDomain(domain);
    try {
      const res = await fetch("/api/ads/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      showToast(data.fresh > 0 ? `✓ ${domain}: ${data.fresh} ${CT.newAds[lang]}` : `✓ ${domain}: ${CT.noNewAds[lang]}`);
      await load();
    } catch (err) {
      showToast(`✗ ${String(err)}`);
    } finally {
      setBusyDomain(null);
    }
  }

  async function remove(domain: string) {
    setBusyDomain(domain);
    try {
      const res = await fetch("/api/ads/competitors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      if (!res.ok) throw new Error(CT.removeFailed[lang]);
      showToast(`✓ ${domain} ${CT.removed[lang]}`);
      await load();
    } catch (err) {
      showToast(`✗ ${String(err)}`);
    } finally {
      setBusyDomain(null);
    }
  }

  function toggle(domain: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain); else next.add(domain);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5 text-brand" /> {CT.title[lang]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{CT.description[lang]}</p>

        <form onSubmit={addCompetitor} className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={CT.placeholder[lang]}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" disabled={adding || !query.trim()}>
            <Plus className={`h-4 w-4 mr-1 ${adding ? "animate-pulse" : ""}`} />
            {adding ? CT.searching[lang] : CT.follow[lang]}
          </Button>
        </form>

        {competitors === null ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : !competitors.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">{CT.empty[lang]}</p>
        ) : (
          <div className="space-y-3">
            {competitors.map((c) => {
              const open = expanded.has(c.domain);
              const newCount = c.ads.filter(isNew).length;
              return (
                <div key={c.id} className="rounded-lg border border-border">
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button onClick={() => toggle(c.domain)} className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{c.name ?? c.domain}</span>
                        <span className="text-xs text-muted-foreground">{c.domain}</span>
                        <Badge className="bg-muted/40 text-muted-foreground border-border">{c.adCount} ads</Badge>
                        {newCount > 0 && (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                            {newCount} {CT.newBadge[lang]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.lastSyncedAt
                          ? `${CT.lastSync[lang]}: ${new Date(c.lastSyncedAt).toLocaleString(lang === "en" ? "en-GB" : "nl-BE")}`
                          : CT.notSynced[lang]}
                      </p>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggle(c.domain)}>
                        {open ? CT.hide[lang] : CT.showAds[lang]}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        disabled={busyDomain === c.domain}
                        onClick={() => refresh(c.domain)}
                        title={CT.syncNow[lang]}
                      >
                        <RefreshCw className={`h-4 w-4 ${busyDomain === c.domain ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        disabled={busyDomain === c.domain}
                        onClick={() => remove(c.domain)}
                        title={CT.stopTracking[lang]}
                      >
                        <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-border px-4 py-3">
                      {!c.ads.length ? (
                        <p className="text-sm text-muted-foreground py-2">{CT.noAds[lang]}</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {c.ads.slice(0, shownCounts[c.domain] ?? 12).map((a) => {
                              const f = FORMAT_STYLE[a.format] ?? FORMAT_STYLE.unknown;
                              const broken = brokenPreviews.has(a.id);
                              return (
                                <a
                                  key={a.id}
                                  href={a.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group rounded-lg border border-border overflow-hidden hover:border-brand/50 transition-colors"
                                >
                                  <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
                                    {a.previewUrl && !broken ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={proxied(a.previewUrl)}
                                        alt={`${a.format} ad from ${c.domain}`}
                                        className="h-full w-full object-contain"
                                        loading="lazy"
                                        onError={() =>
                                          setBrokenPreviews((prev) => new Set(prev).add(a.id))
                                        }
                                      />
                                    ) : (
                                      <div className="text-xs text-muted-foreground text-center px-3 py-6">
                                        <ImageOff className="h-4 w-4 mx-auto mb-1" />
                                        {CT.noPreview[lang]}
                                        <ExternalLink className="h-3 w-3 mx-auto mt-1 opacity-60" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="px-2 py-1.5 flex items-center gap-1 flex-wrap">
                                    <Badge className={f.cls}>{f.label[lang]}</Badge>
                                    {isNew(a) && (
                                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">{CT.newBadge[lang]}</Badge>
                                    )}
                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                      {a.lastShown ? `${CT.until[lang]} ${dateShort(a.lastShown)}` : ""}
                                    </span>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                          {c.ads.length > (shownCounts[c.domain] ?? 12) && (
                            <div className="pt-3 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setShownCounts((prev) => ({ ...prev, [c.domain]: (prev[c.domain] ?? 12) + 24 }))
                                }
                              >
                                {CT.showMore[lang]} ({(shownCounts[c.domain] ?? 12)} {CT.of[lang]} {c.ads.length})
                              </Button>
                            </div>
                          )}
                        </>
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
