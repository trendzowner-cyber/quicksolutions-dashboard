"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReviewModal } from "@/components/products/review-modal";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface PageAIButtonProps {
  pageId: number;
  title: string;
  content: string;
}

export function PageAIButton({ pageId, title, content }: PageAIButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    title: string;
    content: string;
    metaDescription: string;
  } | null>(null);
  const [showReview, setShowReview] = useState(false);

  async function handleOptimize() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/optimize-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, title, content }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setSuggestion(data);
      setShowReview(true);
    } catch {
      toast.error("Fout bij optimaliseren pagina");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(finalContent: string) {
    await fetch(`/api/wp/pages/${pageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: suggestion?.title || title,
        content: finalContent,
      }),
    });

    if (suggestion?.metaDescription) {
      await fetch(`/api/wp/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: {
            _yoast_wpseo_metadesc: suggestion.metaDescription,
          },
        }),
      });
    }

    toast.success("Pagina bijgewerkt!");
    router.refresh();
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
        {loading ? "Optimaliseren..." : "AI Optimaliseer Pagina"}
      </Button>

      {suggestion && (
        <ReviewModal
          open={showReview}
          onClose={() => setShowReview(false)}
          original={content}
          suggested={suggestion.content}
          label="Pagina Inhoud"
          type="html"
          onApprove={handleApprove}
        />
      )}
    </>
  );
}
