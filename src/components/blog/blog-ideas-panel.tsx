"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Lightbulb, ArrowRight, Wand2, History, Link2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { FOCUS_ANGLES } from "@/lib/blog-focus";

interface IdeaMeta {
  slug?: string;
  primaryKeyword?: string;
  intent?: string;
  contentType?: string;
  funnel?: string;
  priority?: number;
  internalLinks?: { anchorText: string; url: string }[];
  faqQuestions?: string[];
  focus?: string;
}

interface BlogIdea {
  title: string;
  description: string;
  targetKeywords: string[];
  meta?: IdeaMeta | null;
}

const AUTO = "auto";

export function BlogIdeasPanel() {
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [ideas, setIdeas] = useState<BlogIdea[]>([]);
  const [focus, setFocus] = useState<string>(AUTO);
  const [lastFocus, setLastFocus] = useState<string | null>(null);
  const router = useRouter();

  // Load previously saved ideas on mount
  useEffect(() => {
    async function loadSaved() {
      try {
        const res = await fetch("/api/ai/blog-ideas");
        if (res.ok) {
          const data = await res.json();
          if (data.ideas?.length > 0) {
            setIdeas(data.ideas);
          }
        }
      } catch {
        // Silently ignore — no saved ideas yet
      } finally {
        setLoadingSaved(false);
      }
    }
    loadSaved();
  }, []);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/blog-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: focus === AUTO ? undefined : focus }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setIdeas(data.ideas || []);
      setLastFocus(data.focus ?? null);
      if (data.generated > 0) {
        toast.success(`${data.generated} nieuwe ideeën — invalshoek: ${data.focus}`);
      } else {
        toast.warning("Geen nieuwe ideeën — alles wat de AI voorstelde bestond al. Probeer een andere invalshoek.");
      }
    } catch {
      toast.error("Fout bij genereren van blog ideeën");
    } finally {
      setLoading(false);
    }
  }

  function openIdea(idea: BlogIdea) {
    const params = new URLSearchParams({ topic: idea.title });
    const kw = idea.meta?.primaryKeyword || idea.targetKeywords?.slice(0, 4).join(", ");
    if (kw) params.set("keywords", kw);
    router.push(`/dashboard/blog/nieuw?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={handleGenerate}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lightbulb className="h-4 w-4" />
          )}
          {loading ? "Genereert ideeën..." : "Genereer Blog Ideeën"}
        </Button>
        <Select value={focus} onValueChange={(v) => setFocus(v ?? AUTO)}>
          <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[260px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>Automatisch (roteert per batch)</SelectItem>
            {FOCUS_ANGLES.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {ideas.length > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <History className="h-3 w-3" />
            {ideas.length} opgeslagen
          </span>
        )}
      </div>

      {lastFocus && !loading && (
        <p className="text-xs text-muted-foreground">
          Laatste batch — invalshoek: <span className="text-foreground">{lastFocus}</span>
        </p>
      )}

      {loadingSaved && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Ideeën laden...
        </div>
      )}

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ideas.map((idea, i) => (
            <Card key={`${idea.title}-${i}`} className="border-border">
              <CardContent className="p-4 space-y-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{idea.title}</p>
                    {typeof idea.meta?.priority === "number" && (
                      <span
                        className={`shrink-0 rounded-full border px-1.5 text-[10px] font-semibold ${
                          idea.meta.priority === 1
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-border text-muted-foreground"
                        }`}
                        title="Schrijfprioriteit"
                      >
                        P{idea.meta.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{idea.description}</p>
                </div>

                {(idea.meta?.contentType || idea.meta?.intent || idea.meta?.funnel) && (
                  <div className="flex flex-wrap gap-1">
                    {idea.meta?.contentType && (
                      <Badge variant="outline" className="text-[10px]">{idea.meta.contentType}</Badge>
                    )}
                    {idea.meta?.intent && (
                      <Badge variant="outline" className="text-[10px]">{idea.meta.intent}</Badge>
                    )}
                    {idea.meta?.funnel && (
                      <Badge variant="outline" className="text-[10px]">{idea.meta.funnel}</Badge>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-1">
                  {idea.targetKeywords?.map((kw) => (
                    <Badge key={kw} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>

                {(idea.meta?.internalLinks?.length ?? 0) > 0 && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-sky-400">
                      <Link2 className="h-3 w-3" />
                      Interne links
                    </p>
                    {idea.meta?.internalLinks?.map((l) => (
                      <p key={`${l.url}-${l.anchorText}`} className="truncate text-[11px] text-muted-foreground">
                        {l.anchorText} <span className="opacity-60">→ {l.url.replace(/^https?:\/\/[^/]+/, "")}</span>
                      </p>
                    ))}
                  </div>
                )}

                {(idea.meta?.faqQuestions?.length ?? 0) > 0 && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-violet-400">
                      <HelpCircle className="h-3 w-3" />
                      FAQ
                    </p>
                    {idea.meta?.faqQuestions?.map((q) => (
                      <p key={q} className="text-[11px] text-muted-foreground">
                        {q}
                      </p>
                    ))}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-emerald-400"
                  onClick={() => openIdea(idea)}
                >
                  <Wand2 className="h-3 w-3" />
                  Gebruik dit onderwerp
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
