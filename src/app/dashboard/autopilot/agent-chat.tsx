"use client";

// ─── Agent chat — multi-turn conversation with the Google Ads agent ───
// Messages persist in AdsAgentChatMessage (rolling 40 per account). The API
// folds the last turns into the prompt, so follow-ups ("en in Gent?") work.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Send, Trash2 } from "lucide-react";
import { MiniMarkdown } from "@/components/ui/mini-markdown";
import { timeAgo } from "@/lib/format";
import { useAdsLang, type L } from "./i18n";

const CS = {
  chatTitle: { nl: "Chat met de agent", en: "Chat with the agent" },
  clearChat: { nl: "Wis chat", en: "Clear chat" },
  confirmClear: { nl: "Chatgeschiedenis wissen?", en: "Clear chat history?" },
  chatCleared: { nl: "✓ Chat gewist", en: "✓ Chat cleared" },
  error: { nl: "**Fout:**", en: "**Error:**" },
  approveRun: { nl: "Keur goed & voer uit", en: "Approve & run" },
  reject: { nl: "Wijs af", en: "Reject" },
  executing: { nl: "Uitvoeren…", en: "Executing…" },
  executed: { nl: "✓ Uitgevoerd", en: "✓ Executed" },
  rejected: { nl: "Afgewezen", en: "Rejected" },
  failedRetry: { nl: "Mislukt — probeer via de voorstellenlijst", en: "Failed — retry via the proposals list" },
  remembered: { nl: "🧠 Onthouden:", en: "🧠 Remembered:" },
  emptyState: { nl: "Stel een vraag over je account — de agent kijkt mee met je live data, je profiel en je regels. Het gesprek blijft bewaard.", en: "Ask a question about your account — the agent looks at your live data, your profile and your rules. The conversation is saved." },
  placeholder: { nl: "Typ je vraag… (Enter = versturen, Shift+Enter = nieuwe lijn)", en: "Type your question… (Enter = send, Shift+Enter = new line)" },
  toastExecuted: { nl: "✓ Uitgevoerd:", en: "✓ Executed:" },
  toastRejected: { nl: "✓ Voorstel afgewezen", en: "✓ Proposal rejected" },
  toastFailed: { nl: "✗ Actie mislukt:", en: "✗ Action failed:" },
} satisfies Record<string, L>;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  proposals?: ChatProposal[];
  learned?: string[];
}

interface ChatProposal {
  id: string;
  type: string;
  title: string;
  reason: string;
  state?: "pending" | "executing" | "executed" | "rejected" | "failed";
  resultMsg?: string;
}

const PROPOSAL_TYPE_LABEL: Record<string, L> = {
  add_negatives: { nl: "Negatief keyword", en: "Negative keyword" },
  pause_keyword: { nl: "Keyword pauzeren", en: "Pause keyword" },
  set_budget: { nl: "Budget", en: "Budget" },
  remove_negative: { nl: "Negatief verwijderen", en: "Remove negative" },
  create_campaign: { nl: "Nieuwe campagne", en: "New campaign" },
};

const SUGGESTIONS: Record<"nl" | "en", string[]> = {
  nl: [
    "Welke zoektermen kosten het meest zonder conversie?",
    "Welke campagne presteert het best deze maand?",
    "Wat zou jij deze week als eerste aanpassen?",
  ],
  en: [
    "Which search terms cost the most without conversions?",
    "Which campaign performs best this month?",
    "What would you change first this week?",
  ],
};

export function AgentChat({
  accountId,
  showToast,
  onProposalsChanged,
}: {
  accountId: string;
  showToast: (m: string) => void;
  onProposalsChanged?: () => void;
}) {
  const { lang } = useAdsLang();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ads/agent/chat?accountId=${accountId}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  // Keep the newest message in view
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: msg,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...(m ?? []), optimistic]);
    try {
      const res = await fetch("/api/ads/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, accountId, lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      const assistantMsg: ChatMessage = {
        ...data.assistantMessage,
        proposals: (data.proposals ?? []).map((p: ChatProposal) => ({ ...p, state: "pending" as const })),
        learned: data.learned ?? [],
      };
      setMessages((m) => [
        ...(m ?? []).filter((x) => x.id !== optimistic.id),
        data.userMessage,
        assistantMsg,
      ]);
      if (assistantMsg.proposals?.length) {
        onProposalsChanged?.();
      }
    } catch (e) {
      setMessages((m) => [
        ...(m ?? []),
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `${CS.error[lang]} ${String(e)}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function clearChat() {
    if (!window.confirm(CS.confirmClear[lang])) return;
    setClearing(true);
    try {
      await fetch("/api/ads/agent/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      setMessages([]);
      showToast(CS.chatCleared[lang]);
    } finally {
      setClearing(false);
    }
  }

  async function decideProposal(messageId: string, proposalId: string, decision: "approve" | "reject") {
    // Approve executes against the live account (same guarded path as the list
    // above) — the button is the human approval, nothing is automatic.
    setMessages((m) =>
      (m ?? []).map((msg) =>
        msg.id !== messageId ? msg : {
          ...msg,
          proposals: msg.proposals?.map((p) => p.id === proposalId ? { ...p, state: decision === "approve" ? "executing" as const : p.state } : p),
        }
      )
    );
    try {
      const res = await fetch("/api/ads/agent/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposalId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setMessages((m) =>
        (m ?? []).map((msg) =>
          msg.id !== messageId ? msg : {
            ...msg,
            proposals: msg.proposals?.map((p) =>
              p.id === proposalId
                ? { ...p, state: decision === "approve" ? "executed" as const : "rejected" as const, resultMsg: data.summary }
                : p
            ),
          }
        )
      );
      showToast(decision === "approve" ? `${CS.toastExecuted[lang]} ${data.summary}` : CS.toastRejected[lang]);
      onProposalsChanged?.();
    } catch (e) {
      setMessages((m) =>
        (m ?? []).map((msg) =>
          msg.id !== messageId ? msg : {
            ...msg,
            proposals: msg.proposals?.map((p) => p.id === proposalId ? { ...p, state: "failed" as const } : p),
          }
        )
      );
      showToast(`${CS.toastFailed[lang]} ${String(e)}`);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-5 w-5 text-google" /> {CS.chatTitle[lang]}
        </CardTitle>
        {messages && messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearChat} disabled={clearing}
            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400">
            <Trash2 className="h-4 w-4 mr-1" /> {CS.clearChat[lang]}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Message list */}
        <div ref={scrollRef} className="max-h-[480px] overflow-y-auto space-y-4 pr-1">
          {messages === null ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-2/3 ml-auto" />
              <Skeleton className="h-20 w-3/4" />
            </div>
          ) : messages.length === 0 && !sending ? (
            <div className="py-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                {CS.emptyState[lang]}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS[lang].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-google/30 bg-google/5 px-3 py-1.5 text-xs text-google hover:bg-google/15 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%]">
                    <div className="rounded-2xl rounded-br-sm bg-google text-google-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
                      {m.content}
                    </div>
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">{timeAgo(m.createdAt)}</p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-google/15 text-google">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-bl-sm border border-border bg-muted/50 px-4 py-2.5 text-sm">
                      <MiniMarkdown text={m.content} />
                    </div>
                    {/* Inline action cards — approve executes via the guarded path */}
                    {m.proposals?.map((p) => (
                      <div key={p.id} className="mt-2 rounded-xl border border-google/30 bg-google/5 px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-google/30 bg-google/10 px-2 py-0.5 text-[10px] font-medium text-google">
                            {PROPOSAL_TYPE_LABEL[p.type]?.[lang] ?? p.type}
                          </span>
                          <p className="text-sm font-medium">{p.title}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{p.reason}</p>
                        {p.state === "pending" ? (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" onClick={() => decideProposal(m.id, p.id, "approve")}>
                              {CS.approveRun[lang]}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => decideProposal(m.id, p.id, "reject")}>
                              {CS.reject[lang]}
                            </Button>
                          </div>
                        ) : p.state === "executing" ? (
                          <p className="mt-2 text-xs text-muted-foreground">{CS.executing[lang]}</p>
                        ) : p.state === "executed" ? (
                          <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">{CS.executed[lang]}{p.resultMsg ? ` — ${p.resultMsg}` : ""}</p>
                        ) : p.state === "rejected" ? (
                          <p className="mt-2 text-xs text-muted-foreground">{CS.rejected[lang]}</p>
                        ) : (
                          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{CS.failedRetry[lang]}</p>
                        )}
                      </div>
                    ))}
                    <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(m.createdAt)}</p>
                    {m.learned && m.learned.length > 0 && (
                      <p className="mt-1 text-[10px] text-google">
                        {CS.remembered[lang]} {m.learned.join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              )
            )
          )}

          {/* Thinking indicator */}
          {sending && (
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-google/15 text-google">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-bl-sm border border-border bg-muted/50 px-4 py-3">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 border-t border-border pt-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={CS.placeholder[lang]}
            rows={1}
            maxLength={2000}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-google/40"
          />
          <Button onClick={() => send()} disabled={sending || !input.trim()} className="rounded-xl">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
