"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HeartPulse, Globe, Server, Activity, Clock, AlertTriangle } from "lucide-react";

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════
interface Monitor {
  target: string;
  status: "up" | "down" | "unknown";
  statusCode: number | null;
  errorMsg: string | null;
  lastCheckedAt: string | null;
  checks24h: number;
  uptime24h: number | null;
  history: { hour: string; pct: number }[];
}

const TARGET_ICONS: Record<string, React.ElementType> = {
  "quicksolutionspro.be": Globe,
  "quicksolutions-dashboard.vercel.app": Server,
};

interface Incident {
  id: string;
  target: string;
  status: string;
  statusCode: number | null;
  errorMsg: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
}

function shortTarget(target: string): string {
  return target.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function humanDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} u ${min % 60} min`;
}

// ═══════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════
export default function StatusPage() {
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      // Both in parallel — the incident list is a second round trip and must
      // not delay the live status the page exists for.
      const [statusRes, incidentRes] = await Promise.all([
        fetch("/api/monitoring/status"),
        fetch("/api/monitoring/incidents"),
      ]);
      if (statusRes.ok) {
        setMonitors((await statusRes.json()).monitors);
        setError(null);
      } else {
        setError("Status ophalen mislukt");
      }
      if (incidentRes.ok) {
        setIncidents((await incidentRes.json()).incidents);
      }
    } catch {
      setError("Status ophalen mislukt");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  function timeAgo(iso: string | null): string {
    if (!iso) return "nog geen check";
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "zojuist";
    if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
    return `${Math.floor(s / 3600)} uur geleden`;
  }

  // Build a 24-slot strip: last 24 hours, oldest → newest.
  // Match on floored hour, not exact ms equality — ISO strings with differing
  // precision or timezone offsets otherwise never match and the strip renders
  // blank even when 1,440 checks exist.
  function buildStrip(history: Monitor["history"]) {
    const byHour = new Map<number, number>();
    for (const h of history ?? []) {
      const t = new Date(h.hour).getTime();
      if (!Number.isNaN(t)) byHour.set(Math.floor(t / 3_600_000), h.pct);
    }
    const slots: { label: string; pct: number | null }[] = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setMinutes(0, 0, 0);
      hourStart.setHours(now.getHours() - i);
      const pct = byHour.get(Math.floor(hourStart.getTime() / 3_600_000)) ?? null;
      slots.push({
        label: hourStart.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }),
        pct,
      });
    }
    return slots;
  }

  function stripColor(pct: number | null): string {
    if (pct === null) return "bg-border";
    if (pct >= 99.9) return "bg-emerald-500/80";
    if (pct > 0) return "bg-amber-500/80";
    return "bg-rose-500/80";
  }

  if (!monitors && !error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
          <p className="text-muted-foreground text-sm">Uptime monitoring</p>
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
        <p className="text-muted-foreground text-sm">
          Elke minuut gecontroleerd vanuit ons eigen systeem (Supabase, Parijs) — onafhankelijk van Kinsta en Vercel.
        </p>
      </div>

      {error && (
        <Card className="border-rose-500/30">
          <CardContent className="pt-6 flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {monitors?.map((m) => {
          const Icon = TARGET_ICONS[m.target] ?? HeartPulse;
          const slots = buildStrip(m.history);
          return (
            <Card key={m.target}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {m.target}
                  </CardTitle>
                  {m.status === "up" && (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Online</Badge>
                  )}
                  {m.status === "down" && (
                    <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30">Offline</Badge>
                  )}
                  {m.status === "unknown" && (
                    <Badge className="bg-muted text-muted-foreground">Onbekend</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Uptime (24u)</p>
                    <p className="text-lg font-semibold">
                      {m.uptime24h === null ? "—" : `${m.uptime24h.toLocaleString("nl-BE")}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Checks (24u)</p>
                    <p className="text-lg font-semibold">{m.checks24h.toLocaleString("nl-BE")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Laatste check</p>
                    <p className="text-lg font-semibold">{timeAgo(m.lastCheckedAt)}</p>
                  </div>
                </div>

                {/* 24-hour strip */}
                {slots.every((s) => s.pct === null) ? (
                  <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">
                    Geen uur-data beschikbaar voor de afgelopen 24 uur — de uptime-monitor schrijft mogelijk nog geen historiek.
                  </p>
                ) : (
                  <>
                    <div className="flex items-end gap-[2px] h-12">
                      {slots.map((s, i) => (
                        <div
                          key={i}
                          title={`${s.label} — ${s.pct === null ? "geen data" : s.pct + "% up"}`}
                          className={`flex-1 rounded-sm ${stripColor(s.pct)} ${s.pct === null ? "h-2 self-center" : "h-full"}`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>24 uur geleden</span>
                      <span>nu</span>
                    </div>
                  </>
                )}

                {m.status === "down" && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {m.errorMsg
                        ? `Fout: ${m.errorMsg} (HTTP ${m.statusCode ?? "—"})`
                        : `Fout: HTTP ${m.statusCode ?? "onbekend"}`}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Incident history ──
          The strip above answers "is it up now"; this answers the question the
          client actually asks: how often does it go down, and for how long. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Storingen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen storingen geregistreerd — de site is sinds de start van de monitoring
              niet offline geweest.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        inc.status === "resolved" ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {shortTarget(inc.target)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(inc.startedAt).toLocaleString("nl-BE", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {inc.statusCode ? ` — HTTP ${inc.statusCode}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      inc.status === "resolved"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }
                  >
                    {inc.status === "resolved"
                      ? humanDuration(inc.durationSec ?? 0)
                      : "loopt nog"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        Checks draaien elke minuut: de website op <code className="text-foreground/80">/wp-json/</code> en de dashboard op <code className="text-foreground/80">/login</code>. Offline = foutcode 5xx of time-out.
      </p>
    </div>
  );
}
