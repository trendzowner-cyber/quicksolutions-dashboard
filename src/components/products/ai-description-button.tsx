"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReviewModal } from "./review-modal";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";

interface AIDescriptionButtonProps {
  productId: number;
  currentDescription: string;
  shortDescription: string;
  title: string;
  onUpdated: () => void;
}

export function AIDescriptionButton({
  productId,
  currentDescription,
  shortDescription,
  title,
  onUpdated,
}: AIDescriptionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/improve-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDescription,
          shortDescription,
          title,
        }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      setSuggestion(data.suggestion);
      setShowReview(true);
    } catch {
      toast.error("Fout bij genereren van beschrijving");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(finalDescription: string) {
    const res = await fetch(`/api/wp/products/${productId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: finalDescription }),
    });

    if (!res.ok) throw new Error("Update failed");

    toast.success("Beschrijving bijgewerkt!");
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
        {loading ? "Bezig..." : "AI Verbeter Beschrijving"}
      </Button>

      {suggestion && (
        <ReviewModal
          open={showReview}
          onClose={() => setShowReview(false)}
          original={currentDescription}
          suggested={suggestion}
          label="Beschrijving"
          type="html"
          onApprove={handleApprove}
        />
      )}
    </>
  );
}
