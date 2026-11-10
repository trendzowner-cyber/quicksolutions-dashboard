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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

const SUGGESTIONS = [
  "Welke zoektermen kosten het meest zonder conversie?",
  "Welke campagne presteert het best deze maand?",
  "Wat zou jij deze week als eerste aanpassen?",
];

export function AgentChat({
  accountId,
  showToast,
}: {
  accountId: string;
  showToast: (m: string) => void;
}) {
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
        body: JSON.stringify({ message: msg, accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      setMessages((m) => [
        ...(m ?? []).filter((x) => x.id !== optimistic.id),
        data.userMessage,
        data.assistantMessage,
      ]);
    } catch (e) {
      setMessages((m) => [
        ...(m ?? []),
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `**Fout:** ${String(e)}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function clearChat() {
    if (!window.confirm("Chatgeschiedenis wissen?")) return;
    setClearing(true);
    try {
      await fetch("/api/ads/agent/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      setMessages([]);
      showToast("✓ Chat gewist");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-5 w-5 text-google" /> Chat met de agent
        </CardTitle>
        {messages && messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearChat} disabled={clearing}
            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400">
            <Trash2 className="h-4 w-4 mr-1" /> Wis chat
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
                Stel een vraag over je account — de agent kijkt mee met je live data,
                je profiel en je regels. Het gesprek blijft bewaard.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
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
                    <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(m.createdAt)}</p>
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
            placeholder="Typ je vraag… (Enter = versturen, Shift+Enter = nieuwe lijn)"
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
