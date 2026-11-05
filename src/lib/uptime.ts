// Uptime reads over the raw `monitoring.uptime_checks` table (written by the
// qs-uptime-tick pg_cron job, one row per target per minute).
//
// Shared by the status API, the Telegram /uptime and /today commands, and the
// morning briefing — it used to live inline in the status route, which meant
// every new consumer would have copy-pasted the down rule below.

import { db } from "@/lib/db";

type HourBucket = {
  target: string;
  hour: Date;
  total: number | bigint;
  down: number | bigint;
};

type LastCheck = {
  target: string;
  status_code: number | null;
  error_msg: string | null;
  checked_at: Date;
};

/** Down = no status code at all (DNS/TLS/timeout) or a 5xx. A 403 counts as
 *  up: the site answering "no" is still the site answering. */
export function isDownCheck(statusCode: number | null): boolean {
  return statusCode === null || statusCode >= 500;
}

export interface UptimeMonitor {
  target: string;
  status: "up" | "down" | "unknown";
  statusCode: number | null;
  errorMsg: string | null;
  lastCheckedAt: string | null;
  checks24h: number;
  uptime24h: number | null;
  history: { hour: string; pct: number }[];
}

export async function fetchUptimeMonitors(): Promise<UptimeMonitor[]> {
  const [hours, lastChecks] = await Promise.all([
    db.$queryRaw<HourBucket[]>`
      SELECT target,
             date_trunc('hour', checked_at) AS hour,
             count(*) AS total,
             count(*) FILTER (WHERE status_code IS NULL OR status_code >= 500) AS down
      FROM monitoring.uptime_checks
      WHERE checked_at > now() - interval '24 hours'
      GROUP BY target, hour
      ORDER BY target, hour ASC
    `,
    db.$queryRaw<LastCheck[]>`
      SELECT DISTINCT ON (target) target, status_code, error_msg, checked_at
      FROM monitoring.uptime_checks
      ORDER BY target, checked_at DESC
    `,
  ]);

  return [...new Set(lastChecks.map((r) => r.target))].map((target) => {
    const buckets = hours.filter((h) => h.target === target);
    const total = buckets.reduce((s, b) => s + Number(b.total), 0);
    const down = buckets.reduce((s, b) => s + Number(b.down), 0);
    const last = lastChecks.find((l) => l.target === target);
    const isUp = last ? !isDownCheck(last.status_code) : null;

    return {
      target,
      status: isUp === null ? ("unknown" as const) : isUp ? ("up" as const) : ("down" as const),
      statusCode: last?.status_code ?? null,
      errorMsg: last?.error_msg ?? null,
      lastCheckedAt: last?.checked_at?.toISOString() ?? null,
      checks24h: total,
      uptime24h: total > 0 ? Number((((total - down) / total) * 100).toFixed(2)) : null,
      history: buckets.map((b) => ({
        hour: b.hour.toISOString(),
        pct: Number(((Number(b.total) - Number(b.down)) / Number(b.total)) * 100),
      })),
    };
  });
}

/** Human target name for messages — the raw target is a URL. */
export function targetLabel(target: string): string {
  try {
    return new URL(target).hostname.replace(/^www\./, "");
  } catch {
    return target;
  }
}
