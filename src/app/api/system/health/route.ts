// Live integration health checks.
//
// The old settings page reported "Verbonden" purely on whether an env var was
// present, so a revoked Google token or a missing optional var looked identical
// to a working integration — which is how the Business Profile connection stayed
// dead for two weeks without anyone noticing. Every check here actually talks to
// the service (or its token endpoint) and reports what really happened.

import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGoogleAuthState } from "@/lib/google-business";
import { ADS_ACCOUNTS } from "@/lib/google-ads";
import { wpFetch, wcFetch } from "@/lib/wp-client";

export type HealthStatus = "ok" | "error" | "warning" | "unconfigured";

export interface ServiceHealth {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
  meta?: string;
}

const CHECK_TIMEOUT_MS = 8000;

/** Runs a check but never lets it hang the whole page — a dead service must
 *  degrade to a red row, not an infinite spinner. */
async function safe(
  fn: () => Promise<ServiceHealth>,
  fallback: Omit<ServiceHealth, "status" | "detail"> & { detail?: string }
): Promise<ServiceHealth> {
  try {
    return await Promise.race([
      fn(),
      new Promise<ServiceHealth>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ...fallback,
              status: "error",
              detail: `Time-out na ${CHECK_TIMEOUT_MS / 1000}s — service antwoordt niet`,
            }),
          CHECK_TIMEOUT_MS
        )
      ),
    ]);
  } catch (err) {
    return {
      ...fallback,
      status: "error",
      detail: err instanceof Error ? err.message : "Onbekende fout",
    };
  }
}

function hoursAgo(date: Date): string {
  const h = (Date.now() - date.getTime()) / 36e5;
  if (h < 1) return `${Math.round(h * 60)} min geleden`;
  if (h < 48) return `${Math.round(h)} uur geleden`;
  return `${Math.round(h / 24)} dagen geleden`;
}

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: Promise<ServiceHealth>[] = [];

  // ── Database ──
  checks.push(
    safe(
      async () => {
        const users = await db.user.count();
        return {
          id: "database",
          label: "Database (Supabase)",
          status: "ok" as const,
          detail: "Verbinding actief",
          meta: `${users} gebruikers`,
        };
      },
      { id: "database", label: "Database (Supabase)" }
    )
  );

  // ── WordPress ──
  checks.push(
    safe(
      async () => {
        if (!process.env.WP_API_URL) {
          return {
            id: "wordpress",
            label: "WordPress API",
            status: "unconfigured" as const,
            detail: "WP_API_URL ontbreekt",
          };
        }
        const { headers } = await wpFetch<unknown[]>("/posts?per_page=1");
        const total = headers.get("X-WP-Total") ?? "?";
        return {
          id: "wordpress",
          label: "WordPress API",
          status: "ok" as const,
          detail: "Bereikbaar",
          meta: `${total} berichten`,
        };
      },
      { id: "wordpress", label: "WordPress API" }
    )
  );

  // ── WooCommerce ──
  checks.push(
    safe(
      async () => {
        if (!process.env.WC_API_URL) {
          return {
            id: "woocommerce",
            label: "WooCommerce API",
            status: "unconfigured" as const,
            detail: "WC_API_URL ontbreekt",
          };
        }
        const { headers } = await wcFetch<unknown[]>("/products?per_page=1");
        const total = headers.get("X-WP-Total") ?? "?";
        return {
          id: "woocommerce",
          label: "WooCommerce API",
          status: "ok" as const,
          detail: "Bereikbaar",
          meta: `${total} producten`,
        };
      },
      { id: "woocommerce", label: "WooCommerce API" }
    )
  );

  // ── DeepSeek ──
  checks.push(
    safe(
      async () => {
        const key = process.env.DEEPSEEK_API_KEY;
        if (!key) {
          return {
            id: "deepseek",
            label: "DeepSeek AI",
            status: "unconfigured" as const,
            detail: "DEEPSEEK_API_KEY ontbreekt",
          };
        }
        // /models is free and validates the key without spending tokens.
        const res = await fetch("https://api.deepseek.com/models", {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        if (!res.ok) {
          return {
            id: "deepseek",
            label: "DeepSeek AI",
            status: "error" as const,
            detail: `API sleutel geweigerd (HTTP ${res.status})`,
          };
        }
        return {
          id: "deepseek",
          label: "DeepSeek AI",
          status: "ok" as const,
          detail: "Sleutel geldig",
        };
      },
      { id: "deepseek", label: "DeepSeek AI" }
    )
  );

  // ── Google Business Profile ──
  checks.push(
    safe(
      async () => {
        const state = await getGoogleAuthState();
        const last = await db.reviewSyncLog.findFirst({
          orderBy: { startedAt: "desc" },
          select: { startedAt: true, error: true },
        });

        if (state === "none") {
          return {
            id: "gbp",
            label: "Google Business Profile",
            status: "unconfigured" as const,
            detail: "Niet verbonden — klik 'Google verbinden' op de reviews-pagina",
          };
        }
        if (state === "expired") {
          return {
            id: "gbp",
            label: "Google Business Profile",
            status: "error" as const,
            detail:
              "Google-token verlopen of ingetrokken — opnieuw verbinden nodig",
          };
        }

        const gbpError = last?.error?.includes("GBP:")
          ? last.error
          : null;
        return {
          id: "gbp",
          label: "Google Business Profile",
          status: gbpError ? ("warning" as const) : ("ok" as const),
          detail: gbpError
            ? gbpError
            : "Verbonden — live antwoorden en verwijderingscontrole actief",
          meta: last ? `Laatste sync ${hoursAgo(last.startedAt)}` : undefined,
        };
      },
      { id: "gbp", label: "Google Business Profile" }
    )
  );

  // ── Google Ads ──
  checks.push(
    safe(
      async () => {
        const missing = [
          "GOOGLE_ADS_CLIENT_ID",
          "GOOGLE_ADS_CLIENT_SECRET",
          "GOOGLE_ADS_DEV_TOKEN",
        ].filter((k) => !process.env[k]);
        if (missing.length) {
          return {
            id: "google-ads",
            label: "Google Ads",
            status: "unconfigured" as const,
            detail: `Ontbrekende variabelen: ${missing.join(", ")}`,
          };
        }
        const rec = await db.googleToken.findUnique({
          where: { scope: "adwords" },
        });
        if (!rec?.refreshToken) {
          return {
            id: "google-ads",
            label: "Google Ads",
            status: "unconfigured" as const,
            detail: "Geen Ads-token — verbind Google Ads opnieuw",
          };
        }
        // Exercise the refresh rather than trusting the stored row: an expired
        // access token is normal, a rejected refresh token is not.
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: rec.refreshToken,
            client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
            client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
          }).toString(),
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        if (!res.ok) {
          return {
            id: "google-ads",
            label: "Google Ads",
            status: "error" as const,
            detail:
              "Ads-token geweigerd door Google — opnieuw verbinden nodig",
          };
        }
        return {
          id: "google-ads",
          label: "Google Ads",
          status: "ok" as const,
          detail: "Token geldig",
          meta: ADS_ACCOUNTS.join(", "),
        };
      },
      { id: "google-ads", label: "Google Ads" }
    )
  );

  // ── Outscraper (review fallback) ──
  checks.push(
    safe(
      async () => {
        if (!process.env.OUTSCRAPER_API_KEY) {
          return {
            id: "outscraper",
            label: "Outscraper (review-fallback)",
            status: "unconfigured" as const,
            detail: "OUTSCRAPER_API_KEY ontbreekt",
          };
        }
        const sync = await db.outscraperSync.findUnique({ where: { id: "main" } });
        if (!sync) {
          return {
            id: "outscraper",
            label: "Outscraper (review-fallback)",
            status: "warning" as const,
            detail: "Nog nooit gesynchroniseerd",
          };
        }
        // Throttled to 6h in the sync route — 12h means a tick was missed.
        const stale = Date.now() - sync.updatedAt.getTime() > 12 * 36e5;
        return {
          id: "outscraper",
          label: "Outscraper (review-fallback)",
          status: stale ? ("warning" as const) : ("ok" as const),
          detail: stale
            ? "Synchronisatie is verouderd — 6-uurlijkse sync loopt mogelijk niet"
            : "6-uurlijkse sync actief",
          meta: `Laatste fetch ${hoursAgo(sync.updatedAt)}`,
        };
      },
      { id: "outscraper", label: "Outscraper (review-fallback)" }
    )
  );

  // ── Telegram ──
  checks.push(
    safe(
      async () => {
        const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
        const hasChat = !!process.env.TELEGRAM_CHAT_ID;
        if (!hasToken || !hasChat) {
          return {
            id: "telegram",
            label: "Telegram-meldingen",
            status: "unconfigured" as const,
            detail: hasToken
              ? "TELEGRAM_CHAT_ID ontbreekt"
              : "Geen bot-token — meldingen worden nergens naartoe gestuurd",
          };
        }
        const res = await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`,
          { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }
        );
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          return {
            id: "telegram",
            label: "Telegram-meldingen",
            status: "error" as const,
            detail: "Bot-token geweigerd door Telegram",
          };
        }
        return {
          id: "telegram",
          label: "Telegram-meldingen",
          status: "ok" as const,
          detail: "Meldingen actief",
          meta: `@${data.result?.username ?? "bot"}`,
        };
      },
      { id: "telegram", label: "Telegram-meldingen" }
    )
  );

  // ── Review-sync cron ──
  checks.push(
    safe(
      async () => {
        const last = await db.reviewSyncLog.findFirst({
          orderBy: { startedAt: "desc" },
          select: { startedAt: true, status: true, error: true },
        });
        if (!last) {
          return {
            id: "cron",
            label: "Review-sync (elke 15 min)",
            status: "warning" as const,
            detail: "Nog geen sync uitgevoerd",
          };
        }
        // Scheduled every 15 minutes — 40 gives headroom for a missed tick.
        const stale = Date.now() - last.startedAt.getTime() > 40 * 60_000;
        return {
          id: "cron",
          label: "Review-sync (elke 15 min)",
          status: stale ? ("error" as const) : ("ok" as const),
          detail: stale
            ? "Cron loopt niet meer — geen recente sync"
            : "Cron actief",
          meta: `Laatste run ${hoursAgo(last.startedAt)}`,
        };
      },
      { id: "cron", label: "Review-sync (elke 15 min)" }
    )
  );

  const services = await Promise.all(checks);

  const summary = {
    ok: services.filter((s) => s.status === "ok").length,
    warning: services.filter((s) => s.status === "warning").length,
    error: services.filter((s) => s.status === "error").length,
    unconfigured: services.filter((s) => s.status === "unconfigured").length,
  };

  return NextResponse.json({
    services,
    summary,
    checkedAt: new Date().toISOString(),
  });
}
