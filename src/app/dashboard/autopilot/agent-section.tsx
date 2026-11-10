"use client";

// ─── Agent tab — approval-mode autopilot (Bavian parity) ───
// The agent analyses on demand and proposes concrete actions. Nothing touches
// the live account until a human clicks "Keur goed" — execution then goes
// through the same write path and ceilings as the manual actions.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot, RefreshCw, Check, X, Ban, PauseCircle, Wallet, Trash2,
  Brain, Plus, Sparkles, History,
} from "lucide-react";
import { AgentChat } from "./agent-chat";
import { timeAgo } from "@/lib/format";

interface Proposal {
  id: string;
  type: string;
  title: string;
  reason: string;
  status: string;
  resultMsg: string | null;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
}

interface MemoryRow {
  id: string;
  kind: string;
  text: string;
  source: string;
}

const TYPE_STYLE: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
  add_negatives: { icon: Ban, cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30", label: "Negatief keyword" },
  pause_keyword: { icon: PauseCircle, cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", label: "Keyword pauzeren" },
  set_budget: { icon: Wallet, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30", label: "Budget" },
  remove_negative: { icon: Trash2, cls: "bg-muted/40 text-muted-foreground border-border", label: "Negatief verwijderen" },
};

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  executed: { cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", label: "Uitgevoerd" },
  rejected: { cls: "bg-muted/40 text-muted-foreground border-border", label: "Afgewezen" },
  failed: { cls: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30", label: "Mislukt" },
};

export function AgentSection({
  accountId,
  showToast,
}: {
  accountId: string;
  showToast: (m: string) => void;
}) {
  const [pending, setPending] = useState<Proposal[] | null>(null);
  const [history, setHistory] = useState<Proposal[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [memory, setMemory] = useState<MemoryRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [memText, setMemText] = useState("");
  const [memKind, setMemKind] = useState<"rule" | "fact">("rule");

  const load = useCallback(async () => {
    const [p, h, m] = await Promise.all([
      fetch("/api/ads/agent/proposals?status=pending").then((r) => r.json()),
      fetch("/api/ads/agent/proposals?status=all").then((r) => r.json()),
      fetch("/api/ads/agent/memory").then((r) => r.json()),
    ]);
    setPending(p.proposals ?? []);
    setHistory((h.proposals ?? []).filter((x: Proposal) => x.status !== "pending"));
    setMemory(m.memory ?? []);
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  async function runAnalysis() {
    setRunning(true);
    try {
      const res = await fetch("/api/ads/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      showToast(`✓ Analyse klaar: ${data.created} nieuwe voorstellen (${data.skipped} overgeslagen)`);
      await load();
    } catch (e) {
      showToast(`✗ Analyse mislukt: ${String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/ads/agent/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details);
      showToast(decision === "approve" ? `✓ Uitgevoerd: ${data.summary}` : "✓ Voorstel afgewezen");
      await load();
    } catch (e) {
      showToast(`✗ ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function addMemory() {
    const text = memText.trim();
    if (!text) return;
    try {
      const res = await fetch("/api/ads/agent/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: memKind, text }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMemText("");
      await load();
    } catch (e) {
      showToast(`✗ ${String(e)}`);
    }
  }

  async function removeMemory(id: string) {
    await fetch("/api/ads/agent/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      {/* Status + run */}
      <Card>
        <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-google text-google-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium flex items-center gap-2">
                Agent staat aan
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  Goedkeuringsmodus
                </Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                De agent analyseert je account en stelt acties voor. Niets wordt uitgevoerd
                zonder jouw goedkeuring — elke uitvoering wordt gelogd.
              </p>
            </div>
          </div>
          <Button onClick={runAnalysis} disabled={running}>
            {running ? (
              <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Analyse loopt (±20s)…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> Analyseer nu</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Pending proposals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Te bekijken
            {pending && pending.length > 0 && (
              <Badge className="bg-google/10 text-google border-google/30">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!pending ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !pending.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Geen openstaande voorstellen. Klik op &quot;Analyseer nu&quot; om het account te laten nakijken.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((p) => {
                const t = TYPE_STYLE[p.type] ?? TYPE_STYLE.remove_negative;
                return (
                  <div key={p.id} className="rounded-lg border border-border p-4 flex flex-wrap items-center gap-3">
                    <t.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-60">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{p.title}</p>
                        <Badge className={t.cls}>{t.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{p.reason}</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">Voorgesteld {timeAgo(p.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => decide(p.id, "approve")}
                      >
                        {busy === p.id ? "…" : <><Check className="h-4 w-4 mr-1" /> Keur goed &amp; voer uit</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => decide(p.id, "reject")}
                      >
                        <X className="h-4 w-4 mr-1" /> Wijs af
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Memory / rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-google" /> Geheugen &amp; regels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Regels volgt de agent altijd bij zijn voorstellen en antwoorden (bv. &quot;raak de
            merkcampagne nooit aan&quot;, &quot;hou Gent – Overig onder €20/dag&quot;). Feiten zijn context over je zaak.
          </p>
          {!memory ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              {memory.length > 0 && (
                <div className="space-y-2 mb-4">
                  {memory.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm rounded-md border border-border px-3 py-2">
                      <Badge className={m.kind === "rule"
                        ? "bg-google/10 text-google border-google/30"
                        : "bg-muted/40 text-muted-foreground border-border"}>
                        {m.kind === "rule" ? "Regel" : "Feit"}
                      </Badge>
                      <span className="flex-1">{m.text}</span>
                      <button
                        onClick={() => removeMemory(m.id)}
                        className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                        aria-label="Verwijder"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <select
                  value={memKind}
                  onChange={(e) => setMemKind(e.target.value as "rule" | "fact")}
                  className="rounded-md border border-border bg-background px-2 py-2 text-sm"
                >
                  <option value="rule">Regel</option>
                  <option value="fact">Feit</option>
                </select>
                <input
                  value={memText}
                  onChange={(e) => setMemText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMemory()}
                  placeholder={memKind === "rule" ? "bv. Verander nooit iets aan de merkcampagne" : "bv. Wij doen geen reparaties aan tablets van voor 2018"}
                  className="flex-1 min-w-60 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  maxLength={500}
                />
                <Button size="sm" variant="outline" onClick={addMemory} disabled={!memText.trim()}>
                  <Plus className="h-4 w-4 mr-1" /> Voeg toe
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Chat with the agent — persistent multi-turn conversation */}
      <AgentChat accountId={accountId} showToast={showToast} onProposalsChanged={load} />

      {/* History */}
      <div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <History className="h-4 w-4" />
          {showHistory ? "Verberg geschiedenis" : `Toon geschiedenis (${history?.length ?? 0})`}
        </button>
        {showHistory && history && (
          <div className="mt-3 space-y-2">
            {!history.length ? (
              <p className="text-sm text-muted-foreground">Nog geen uitgevoerde of afgewezen voorstellen.</p>
            ) : (
              history.map((p) => {
                const s = STATUS_STYLE[p.status] ?? STATUS_STYLE.rejected;
                return (
                  <div key={p.id} className="rounded-lg border border-border px-4 py-3 flex items-center gap-3">
                    <Badge className={s.cls}>{s.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      {p.resultMsg && <p className="text-xs text-muted-foreground truncate">{p.resultMsg}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {timeAgo(p.executedAt ?? p.decidedAt ?? p.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
