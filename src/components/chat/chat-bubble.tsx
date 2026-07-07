"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  Loader2,
  Lock,
  Unlock,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatCommand {
  command: string;
  args: Record<string, string>;
  message: string;
}

export function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hallo! Ik ben de QS AI-assistent. Stel gerust een vraag over de website, producten of het beheerpaneel. Voor admin commando's heb ik een wachtwoord nodig.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [showPwPrompt, setShowPwPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  async function sendMessage(text: string) {
    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      const reply: Message = {
        role: "assistant",
        content: data.reply,
      };
      setMessages([...newMessages, reply]);

      // Handle admin commands
      if (data.command) {
        handleCommand(data.command);
      }
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Sorry, er is een fout opgetreden. Probeer opnieuw.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleCommand(cmd: ChatCommand) {
    switch (cmd.command) {
      case "VERANDER_THEMA":
        const theme = cmd.args?.theme;
        if (theme === "licht" || theme === "light") {
          document.documentElement.classList.remove("dark");
          localStorage.setItem("theme", "light");
        } else if (theme === "donker" || theme === "dark") {
          document.documentElement.classList.add("dark");
          localStorage.setItem("theme", "dark");
        }
        break;
      case "MAAK_BLOGPOST":
        window.location.href = `/dashboard/blog/nieuw?topic=${encodeURIComponent(cmd.args?.topic || "")}`;
        break;
      case "SCAN_SEO":
        window.location.href = "/dashboard/audit";
        break;
      case "TOON_PRODUCTEN":
        window.location.href = "/dashboard/producten";
        break;
      case "TOON_ORDERS":
        window.location.href = "/dashboard/bestellingen";
        break;
      case "TOON_ANALYTICS":
        window.location.href = "/dashboard";
        break;
      case "BOUW_PLUGIN":
        handleBuildPlugin(cmd.message || cmd.args?.description || "");
        break;
      case "EXPORT_ORDERS":
        window.open("/api/wp/export-orders", "_blank");
        break;
    }
  }

  async function handleBuildPlugin(description: string) {
    setMessages((prev) => [...prev, { role: "system", content: "🔧 Plugin code genereren..." }]);
    try {
      const res = await fetch("/api/ai/build-plugin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: description }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "✅ Plugin gegenereerd!\n\n```php\n" + data.code.slice(0, 1500) + (data.code.length > 1500 ? "\n\n... (code ingekort, volledige code in console)" : "") + "\n```\n\nKopieer deze code en voeg toe via WP Admin → Plugins → Nieuwe plugin, of via de Code Snippets plugin." },
      ]);
      console.log("=== GEGENEREERDE PLUGIN CODE ===");
      console.log(data.code);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ Fout bij genereren plugin. Probeer opnieuw." }]);
    }
  }

  function handlePwSubmit() {
    if (pwInput === "Quicksolutions2024!") {
      setUnlocked(true);
      setShowPwPrompt(false);
      setPwInput("");
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "🔓 Admin-modus ontgrendeld. Je kan nu commando's geven.",
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "❌ Ongeldig wachtwoord. Probeer opnieuw.",
        },
      ]);
      setPwInput("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && input.trim()) {
      e.preventDefault();
      sendMessage(input.trim());
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 ring-2 ring-primary/20 animate-pulse hover:animate-none"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <Card className="fixed inset-0 z-50 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[380px] sm:max-w-[calc(100vw-2rem)] h-full sm:h-[550px] sm:max-h-[calc(100vh-2rem)] flex flex-col shadow-2xl border-primary/20 bg-card/95 backdrop-blur rounded-none sm:rounded-xl">
          {/* Header */}
          <CardHeader className="px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    QS AI Assistent
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {unlocked ? "Admin-modus actief" : "Standaard modus"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {unlocked ? (
                  <Badge
                    variant="default"
                    className="gap-1 text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  >
                    <Unlock className="h-3 w-3" />
                    Admin
                  </Badge>
                ) : (
                  <button
                    onClick={() => setShowPwPrompt(!showPwPrompt)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                    title="Ontgrendel admin commando's"
                  >
                    <Shield className="h-3 w-3" />
                    Ontgrendel
                  </button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Password prompt */}
            {showPwPrompt && !unlocked && (
              <div className="flex gap-2 mt-2">
                <Input
                  type="password"
                  placeholder="Admin wachtwoord..."
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePwSubmit()}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handlePwSubmit}
                >
                  <Lock className="h-3 w-3 mr-1" />
                  OK
                </Button>
              </div>
            )}
          </CardHeader>

          {/* Messages */}
          <CardContent className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : msg.role === "system"
                      ? "bg-muted text-muted-foreground text-xs italic"
                      : "bg-muted text-foreground rounded-bl-sm"
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input */}
          <div className="flex-shrink-0 p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                placeholder={
                  unlocked
                    ? "Geef een commando of stel een vraag..."
                    : "Stel een vraag..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="h-9 text-sm"
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={loading || !input.trim()}
                onClick={() => sendMessage(input.trim())}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {unlocked && (
              <div className="flex flex-wrap gap-1 mt-2">
                {[
                  { label: "Thema donker", cmd: "verander thema naar donker" },
                  { label: "Blog maken", cmd: "maak een blogpost over refurbished iPhones" },
                  { label: "SEO scan", cmd: "scan seo" },
                  { label: "Orders", cmd: "toon orders" },
                ].map((action) => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.cmd)}
                    className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
