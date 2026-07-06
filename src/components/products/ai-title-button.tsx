"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReviewModal } from "./review-modal";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";

interface AITitleButtonProps {
  productId: number;
  currentTitle: string;
  description: string;
  onUpdated: () => void;
}

export function AITitleButton({
  productId,
  currentTitle,
  description,
  onUpdated,
}: AITitleButtonProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/improve-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentTitle,
          description,
        }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      setSuggestion(data.suggestion);
      setShowReview(true);
    } catch {
      toast.error("Fout bij genereren van titel suggestie");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(finalTitle: string) {
    const res = await fetch(`/api/wp/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: finalTitle }),
    });

    if (!res.ok) throw new Error("Update failed");

    toast.success("Titel bijgewerkt!");
    onUpdated();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={loading}
        className="gap-2"
      >
        <Wand2 className="h-4 w-4" />
        {loading ? "Bezig..." : "AI Verbeter Titel"}
      </Button>

      {suggestion && (
        <ReviewModal
          open={showReview}
          onClose={() => setShowReview(false)}
          original={currentTitle}
          suggested={suggestion}
          label="Titel"
          type="text"
          onApprove={handleApprove}
        />
      )}
    </>
  );
}
