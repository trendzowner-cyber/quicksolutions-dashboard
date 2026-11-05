"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  Megaphone,
  RefreshCw,
  ShoppingCart,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "How is it going?" — the question the Vandaag screen deliberately does not
// answer.
//
// Vandaag is about today's work, which is a thing the client can act on. This is
// about the month, which he mostly cannot: he cannot fix a slow week or make
// Google approve a review. So every card here is written to be *read*, not
// worked: one big number, one sentence of context, and a couple of supporting
// figures underneath. No tables, no filters, no drill-downs to pages that would
// only be more of the same.
//
// Two requests, not one. The Google Ads round trip is several times slower than
// the other three cards put together, so it is asked for separately (`?block=ads`)
// and lands in its own card whenever it is ready — the client is reading reviews
// and orders while ads is still in flight, instead of watching one spinner for
// everything.

const PERIOD_LABEL = "Laatste 30 dagen";

interface ReviewsBlock {
  googleRating: number | null;
  googleTotal: number | null;
  ratingUpdatedAt: string | null;
  tracked: number;
  newInPeriod: number;
  answered: number;
  responseRate: number | null;
}

interface WebsiteBlock {
  visitors: number;
  visitorsBefore: number;
  pageViews: number;
  sessions: number;
  topPages: { path: string; views: number }[];
}

interface OrdersBlock {
  count: number;
  revenue: number;
  currency: string;
}

interface AdsBlock {
  connected: boolean;
  account?: string;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  ctr?: number;
  costPerConversion?: number | null;
  roas?: number | null;
}

interface CorePayload {
  periodDays: number;
  reviews: ReviewsBlock | null;
  website: WebsiteBlock | null;
  orders: OrdersBlock | null;
}

const numberFmt = new Intl.NumberFormat("nl-BE");

function euro(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  } catch {
    // An unknown currency code throws rather than falling back.
    return `€${numberFmt.format(value)}`;
  }
}

function Stars({ rating }: { rating: number }) {
  // Rounded, not floored: 4.6 should read as five lit stars with the number
  // beside it, the same way Google draws it.
  const lit = Math.round(rating);
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= lit ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
          )}
        />
      ))}
    </span>
  );
}

function Card({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tone)} />
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CardSkeleton({ title }: { title: string }) {
  return (
    <section className="animate-pulse rounded-2xl border border-border bg-card p-5">
      <div className="h-4 w-28 rounded bg-muted" />
      <p className="sr-only">{title} wordt geladen</p>
      <div className="mt-4 h-9 w-32 rounded bg-muted" />
      <div className="mt-3 h-4 w-44 rounded bg-muted" />
    </section>
  );
}

/** One calm sentence for a block that could not be computed. */
function Unavailable({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-muted-foreground">{children}</p>;
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  // A rounding artefact is not news.
  if (change === 0) return null;
  const up = change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium",
        up ? "text-emerald-400" : "text-rose-400"
      )}
    >
      <Icon className="h-4 w-4" />
      {Math.abs(change)}%
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-base font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function ResultatenPage() {
  const [core, setCore] = useState<CorePayload | null>(null);
  const [ads, setAds] = useState<AdsBlock | null>(null);
  const [coreFailed, setCoreFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadCore = useCallback(async () => {
    try {
      const res = await fetch("/api/client/resultaten", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setCore((await res.json()) as CorePayload);
      setCoreFailed(false);
    } catch {
      setCoreFailed(true);
    }
  }, []);

  const loadAds = useCallback(async () => {
    try {
      const res = await fetch("/api/client/resultaten?block=ads", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { ads: AdsBlock };
      setAds(data.ads);
    } catch {
      // The ads card falls back to its "not linked" sentence rather than
      // reporting a failure the client cannot do anything about.
      setAds({ connected: false });
    }
  }, []);

  // Both fire together; neither waits on the other.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await Promise.all([loadCore(), loadAds()]);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadCore, loadAds]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadCore(), loadAds()]);
    setRefreshing(false);
  };

  const reviews = core?.reviews ?? null;
  const website = core?.website ?? null;
  const orders = core?.orders ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <p className="flex-1 text-sm text-muted-foreground">{PERIOD_LABEL}</p>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Verversen"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* ── Reviews ── */}
      {!core && !coreFailed && <CardSkeleton title="Reviews" />}
      {core && (
        <Card title="Reviews op Google" icon={Star} tone="text-amber-400">
          {!reviews ? (
            <Unavailable>De reviews konden niet opgehaald worden.</Unavailable>
          ) : reviews.googleRating === null ? (
            <Unavailable>Nog geen score bekend van Google.</Unavailable>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-semibold leading-none tabular-nums">
                  {reviews.googleRating.toFixed(1)}
                </span>
                <span className="pb-1">
                  <Stars rating={reviews.googleRating} />
                </span>
              </div>
              {reviews.googleTotal !== null && (
                <p className="mt-2 text-base text-muted-foreground">
                  {numberFmt.format(reviews.googleTotal)} beoordelingen op Google
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <Stat
                  label="Nieuw deze maand"
                  value={numberFmt.format(reviews.newInPeriod)}
                />
                <Stat
                  label="Beantwoord"
                  value={
                    reviews.responseRate === null
                      ? "—"
                      : `${reviews.responseRate}% van ${numberFmt.format(reviews.tracked)}`
                  }
                />
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── Website ── */}
      {!core && !coreFailed && <CardSkeleton title="Website" />}
      {core && (
        <Card title="Website" icon={Eye} tone="text-sky-400">
          {!website ? (
            <Unavailable>De bezoekcijfers konden niet opgehaald worden.</Unavailable>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-semibold leading-none tabular-nums">
                  {numberFmt.format(website.visitors)}
                </span>
                <span className="pb-1 text-lg text-muted-foreground">bezoekers</span>
                <span className="ml-auto pb-1.5">
                  <Delta now={website.visitors} before={website.visitorsBefore} />
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <Stat
                  label="Paginaweergaven"
                  value={numberFmt.format(website.pageViews)}
                />
                <Stat label="Sessies" value={numberFmt.format(website.sessions)} />
              </div>

              {website.topPages.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">Meest bekeken</p>
                  <ul className="mt-2 space-y-1.5">
                    {website.topPages.map((page) => (
                      <li
                        key={page.path}
                        className="flex items-baseline gap-3 text-base"
                      >
                        <span className="min-w-0 flex-1 truncate">{page.path}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {numberFmt.format(page.views)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ── Bestellingen ── */}
      {!core && !coreFailed && <CardSkeleton title="Bestellingen" />}
      {core && (
        <Card title="Bestellingen" icon={ShoppingCart} tone="text-emerald-400">
          {!orders ? (
            <Unavailable>De bestellingen konden niet opgehaald worden.</Unavailable>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-semibold leading-none tabular-nums">
                  {euro(orders.revenue, orders.currency)}
                </span>
                <span className="pb-1 text-lg text-muted-foreground">omzet</span>
              </div>
              <p className="mt-2 text-base text-muted-foreground">
                {numberFmt.format(orders.count)}{" "}
                {orders.count === 1 ? "bestelling" : "bestellingen"}
              </p>
            </>
          )}
        </Card>
      )}

      {/* ── Ads ── */}
      {!ads && <CardSkeleton title="Google Ads" />}
      {ads && (
        <Card title="Google Ads" icon={Megaphone} tone="text-violet-400">
          {!ads.connected ? (
            <Unavailable>
              Google Ads is nog niet gekoppeld. Laat dit instellen door
              QuickSolutions.
            </Unavailable>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-semibold leading-none tabular-nums">
                  {euro(ads.spend ?? 0)}
                </span>
                <span className="pb-1 text-lg text-muted-foreground">besteed</span>
              </div>

              {/* Two columns rather than three: the fourth figure is the one he
                  actually opens this card for. Spend on its own only says what
                  went out; "per besteedde euro" says whether it came back. It
                  was computed and then left unrendered, which left the card
                  answering half the question. */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <Stat label="Klikken" value={numberFmt.format(ads.clicks ?? 0)} />
                <Stat
                  label="Conversies"
                  value={numberFmt.format(ads.conversions ?? 0)}
                />
                <Stat
                  label="Per conversie"
                  value={
                    ads.costPerConversion == null
                      ? "—"
                      : euro(ads.costPerConversion)
                  }
                />
                <Stat
                  label="Per besteedde euro"
                  value={ads.roas == null ? "—" : euro(ads.roas)}
                />
              </div>
            </>
          )}
        </Card>
      )}

      {coreFailed && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-base text-muted-foreground">
            De cijfers konden niet geladen worden.
          </p>
          <Button
            variant="outline"
            onClick={refresh}
            disabled={refreshing}
            className="mt-3 h-11"
          >
            <RefreshCw className="h-4 w-4" />
            Opnieuw proberen
          </Button>
        </section>
      )}
    </div>
  );
}
