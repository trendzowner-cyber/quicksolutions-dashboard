"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CircleSlash,
  ExternalLink,
  RefreshCw,
  KeyRound,
  Loader2,
  Bell,
} from "lucide-react";
import { PushControls } from "@/components/pwa/push-controls";

interface ServiceHealth {
  id: string;
  label: string;
  status: "ok" | "error" | "warning" | "unconfigured";
  detail: string;
  meta?: string;
}

interface HealthPayload {
  services: ServiceHealth[];
  summary: { ok: number; warning: number; error: number; unconfigured: number };
  checkedAt: string;
}

const STATUS_STYLE = {
  ok: {
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    text: "Actief",
  },
  warning: {
    icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    text: "Let op",
  },
  error: {
    icon: XCircle,
    className: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    text: "Storing",
  },
  unconfigured: {
    icon: CircleSlash,
    className: "bg-muted text-muted-foreground border-border",
    text: "Niet ingesteld",
  },
} as const;

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ name: string; email: string; role: string; username: string } | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system/health");
      if (!res.ok) throw new Error("Kon status niet ophalen");
      setHealth(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => d.user && setMe(d.user))
      .catch(() => {});
  }, [loadHealth]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("De nieuwe wachtwoorden komen niet overeen");
      return;
    }
    if (newPassword.length < 10) {
      toast.error("Nieuw wachtwoord moet minstens 10 tekens zijn");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wijzigen mislukt");
      toast.success("Wachtwoord gewijzigd");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setSaving(false);
    }
  }

  const problemCount = health
    ? health.summary.error + health.summary.warning + health.summary.unconfigured
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Instellingen</h1>
          <p className="text-muted-foreground">
            Live status van alle koppelingen en je account
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={loadHealth}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Vernieuwen
        </Button>
      </div>

      {/* System status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Systeemstatus</CardTitle>
            {health && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {health.summary.ok} actief
                </Badge>
                {health.summary.error > 0 && (
                  <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                    {health.summary.error} storing
                  </Badge>
                )}
                {health.summary.warning > 0 && (
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                    {health.summary.warning} aandacht
                  </Badge>
                )}
                {health.summary.unconfigured > 0 && (
                  <Badge variant="outline">
                    {health.summary.unconfigured} niet ingesteld
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && !health ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))
          ) : (
            health?.services.map((s) => {
              const style = STATUS_STYLE[s.status];
              const Icon = style.icon;
              return (
                <div
                  key={s.id}
                  className="flex items-start gap-3 rounded-lg border border-border/60 p-3"
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      s.status === "ok"
                        ? "text-emerald-400"
                        : s.status === "error"
                          ? "text-rose-400"
                          : s.status === "warning"
                            ? "text-amber-400"
                            : "text-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{s.label}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${style.className}`}
                      >
                        {style.text}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      {s.detail}
                    </p>
                    {s.meta && (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        {s.meta}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {health && (
            <p className="text-[11px] text-muted-foreground/70 pt-1">
              Laatst gecontroleerd:{" "}
              {new Date(health.checkedAt).toLocaleTimeString("nl-BE")}
              {problemCount === 0 && " — alles werkt"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mijn account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Naam</span>
            <span className="truncate">{me?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">E-mail</span>
            <span className="truncate">{me?.email ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Gebruikersnaam</span>
            <span className="truncate">{me?.username ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Rol</span>
            <Badge variant="outline" className="text-[10px]">
              {me?.role ?? "—"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Notifications — push to the phone (iPhone PWA) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-sky-400" />
            Notificaties
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PushControls />
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" />
            Wachtwoord wijzigen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="current" className="text-xs">
                Huidig wachtwoord
              </Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new" className="text-xs">
                Nieuw wachtwoord
              </Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-xs">
                Bevestig nieuw wachtwoord
              </Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Minstens 10 tekens. Dit wijzigt je eigen account, niet de
              DASHBOARD_PASSWORD variabele.
            </p>
            <Button type="submit" size="sm" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Wachtwoord opslaan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Site info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Site Informatie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Website</span>
            <a
              href="https://quicksolutionspro.be"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-1"
            >
              quicksolutionspro.be
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Platform</span>
            <span>WordPress + WooCommerce</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Taal</span>
            <span>Nederlands (nl_BE)</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">AI Provider</span>
            <span>DeepSeek (deepseek-chat)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
