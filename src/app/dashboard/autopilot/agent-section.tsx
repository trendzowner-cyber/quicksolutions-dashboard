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

const TYPE_STYLE: Record<string, { icon: React.ElementType; tile: string; badge: string; label: string }> = {
  add_negatives: {
    icon: Ban,
    tile: "bg-red-500/15 text-red-500 dark:text-red-400",
    badge: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/40",
    label: "Negatief keyword",
  },
  pause_keyword: {
    icon: PauseCircle,
    tile: "bg-amber-500/15 text-amber-500 dark:text-amber-400",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40",
    label: "Keyword pauzeren",
  },
  set_budget: {
    icon: Wallet,
    tile: "bg-blue-500/15 text-blue-500 dark:text-blue-400",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/40",
    label: "Budget",
  },
  remove_negative: {
    icon: Trash2,
    tile: "bg-muted text-muted-foreground",
    badge: "bg-muted text-muted-foreground border border-border",
    label: "Negatief verwijderen",
  },
  create_campaign: {
    icon: Plus,
    tile: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40",
    label: "Nieuwe campagne",
  },
};

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  executed: { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40", label: "Uitgevoerd" },
  rejected: { cls: "bg-muted text-muted-foreground border border-border", label: "Afgewezen" },
  failed: { cls: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/40", label: "Mislukt" },
};

/** Compact pager: ‹ 1/4 › with page numbers, only rendered when > 1 page. */
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1 pt-3">
      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>‹ Vorige</Button>
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => onPage(i)}
          className={`h-7 min-w-7 rounded-md px-2 text-xs font-medium ${
            i === page ? "bg-google text-google-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {i + 1}
        </button>
      ))}
      <Button size="sm" variant="outline" disabled={page === total - 1} onClick={() => onPage(page + 1)}>Volgende ›</Button>
    </div>
  );
}

function paginate<T>(items: T[], page: number, perPage: number): { slice: T[]; page: number; total: number } {
  const total = Math.max(1, Math.ceil(items.length / perPage));
  const clamped = Math.min(page, total - 1);
  return { slice: items.slice(clamped * perPage, clamped * perPage + perPage), page: clamped, total };
}

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
  const [questions, setQuestions] = useState<{ question: string; why: string }[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [answering, setAnswering] = useState<number | null>(null);
  const [pendingPage, setPendingPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [memPage, setMemPage] = useState(0);

  const load = useCallback(async () => {
    const [p, h, m] = await Promise.all([
      fetch("/api/ads/agent/proposals?status=pending").then((r) => r.json()),
      fetch("/api/ads/agent/proposals?status=all").then((r) => r.json()),
      fetch("/api/ads/agent/memory").then((r) => r.json()),
    ]);
    setPending(p.proposals ?? []);
    setHistory((h.proposals ?? []).filter((x: Proposal) => x.status !== "pending"));
    setMemory(m.memory ?? []);
    // "Needs you" — questions the agent can't answer from data alone
    fetch(`/api/ads/agent/questions?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => setQuestions([]));
  }, [accountId]);

  async function answerQuestion(i: number) {
    const q = questions?.[i];
    const a = (answers[i] ?? "").trim();
    if (!q || !a) return;
    setAnswering(i);
    try {
      const res = await fetch("/api/ads/agent/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.question, answer: a }),
      });
      if (!res.ok) throw new Error("Opslaan mislukt");
      setQuestions((qs) => (qs ?? []).filter((_, idx) => idx !== i));
      setAnswers((prev) => { const next = { ...prev }; delete next[i]; return next; });
      showToast("✓ Antwoord opgeslagen — de agent onthoudt dit");
      await load();
    } catch (e) {
      showToast(`✗ ${String(e)}`);
    } finally {
      setAnswering(null);
    }
  }

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
              {(() => {
                const { slice, page, total } = paginate(pending, pendingPage, 5);
                return (
                  <>
                    {slice.map((p) => {
                const t = TYPE_STYLE[p.type] ?? TYPE_STYLE.remove_negative;
                return (
                  <div key={p.id} className="group rounded-xl border border-border bg-card/50 hover:border-google/40 hover:bg-muted/30 transition-colors p-4 flex flex-wrap items-start gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.tile}`}>
                      <t.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-60">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <p className="font-medium leading-snug">{p.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.badge}`}>{t.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{p.reason}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1.5">Voorgesteld {timeAgo(p.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0 self-center">
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
                    <Pager page={page} total={total} onPage={setPendingPage} />
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Needs you — questions the agent can't answer from data alone */}
      {questions && questions.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold">?</span>
              Heeft jou nodig
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((q, i) => (
              <div key={i} className="rounded-lg border border-amber-500/20 bg-card px-4 py-3">
                <p className="text-sm font-medium">{q.question}</p>
                <p className="text-xs text-muted-foreground mt-1">{q.why}</p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && answerQuestion(i)}
                    placeholder="Jouw antwoord…"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    maxLength={500}
                  />
                  <Button size="sm" onClick={() => answerQuestion(i)} disabled={answering === i || !(answers[i] ?? "").trim()}>
                    {answering === i ? "…" : "Beantwoord"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
              {memory.length > 0 && (() => {
                const { slice, page, total } = paginate(memory, memPage, 8);
                return (
                <div className="space-y-2 mb-4">
                  {slice.map((m) => (
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
                  <Pager page={page} total={total} onPage={setMemPage} />
                </div>
                );
              })()}
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
            ) : (() => {
              const { slice, page, total } = paginate(history, historyPage, 10);
              return (
                <>
              {slice.map((p) => {
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
              })}
              <Pager page={page} total={total} onPage={setHistoryPage} />
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
