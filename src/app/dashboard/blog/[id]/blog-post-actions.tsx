"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wand2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface BlogPostActionsProps {
  postId: number;
  title: string;
  content: string;
}

export function BlogPostActions({
  postId,
  title,
  content,
}: BlogPostActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    suggestedTitle: string | null;
    suggestedMetaDescription: string | null;
    suggestedFocusKeyphrase: string | null;
    internalLinkSuggestions: string[];
    contentImprovements: string;
    score: number;
  } | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [applying, setApplying] = useState(false);

  async function handleOptimize() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/optimize-blog-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, title, content }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setSuggestion(data);
      setShowReview(true);
    } catch {
      toast.error("Fout bij SEO analyse");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!suggestion) return;
    setApplying(true);

    try {
      const updates: Record<string, unknown> = {};

      if (suggestion.suggestedTitle) {
        updates.title = suggestion.suggestedTitle;
      }

      if (suggestion.suggestedMetaDescription || suggestion.suggestedFocusKeyphrase) {
        updates.meta = {
          _yoast_wpseo_metadesc: suggestion.suggestedMetaDescription || "",
          _yoast_wpseo_focuskw: suggestion.suggestedFocusKeyphrase || "",
        };
      }

      if (Object.keys(updates).length > 0) {
        await fetch(`/api/wp/posts/${postId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      }

      toast.success("SEO verbeteringen toegepast!");
      setShowReview(false);
      router.refresh();
    } catch {
      toast.error("Fout bij toepassen verbeteringen");
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOptimize}
        disabled={loading}
        className="gap-2"
      >
        <Wand2 className="h-4 w-4" />
        {loading ? "Analyseren..." : "AI SEO Optimaliseer"}
      </Button>

      <Dialog open={showReview} onOpenChange={(o) => !o && setShowReview(false)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>SEO Analyse</DialogTitle>
            <DialogDescription>
              Score: {suggestion?.score}/100 — Bekijk de voorgestelde
              verbeteringen.
            </DialogDescription>
          </DialogHeader>

          {suggestion && (
            <div className="space-y-4">
              {suggestion.suggestedTitle && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Voorgestelde Titel
                  </p>
                  <p className="text-sm bg-muted/30 rounded p-2">
                    {suggestion.suggestedTitle}
                  </p>
                </div>
              )}

              {suggestion.suggestedMetaDescription && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Voorgestelde Meta Beschrijving
                  </p>
                  <p className="text-sm bg-muted/30 rounded p-2">
                    {suggestion.suggestedMetaDescription}
                  </p>
                </div>
              )}

              {suggestion.suggestedFocusKeyphrase && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Voorgestelde Focus Keyphrase
                  </p>
                  <p className="text-sm font-medium bg-muted/30 rounded p-2">
                    {suggestion.suggestedFocusKeyphrase}
                  </p>
                </div>
              )}

              {suggestion.internalLinkSuggestions?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Interne Link Suggesties
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {suggestion.internalLinkSuggestions.map((link, i) => (
                      <li key={i}>{link}</li>
                    ))}
                  </ul>
                </div>
              )}

              {suggestion.contentImprovements && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Content Verbeteringen
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {suggestion.contentImprovements}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReview(false)}>
              Annuleren
            </Button>
            <Button
              onClick={handleApply}
              disabled={applying}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Verbeteringen Toepassen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
