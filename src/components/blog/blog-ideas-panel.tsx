"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Lightbulb, ArrowRight, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface BlogIdea {
  title: string;
  description: string;
  targetKeywords: string[];
}

export function BlogIdeasPanel() {
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<BlogIdea[]>([]);
  const router = useRouter();

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/blog-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setIdeas(data.ideas || []);
    } catch {
      toast.error("Fout bij genereren van blog ideeën");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
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

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ideas.map((idea, i) => (
            <Card key={i} className="border-border">
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="font-medium text-sm">{idea.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {idea.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {idea.targetKeywords?.map((kw) => (
                    <Badge key={kw} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-emerald-400"
                  onClick={() =>
                    router.push(
                      `/dashboard/blog/nieuw?topic=${encodeURIComponent(
                        idea.title
                      )}`
                    )
                  }
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
