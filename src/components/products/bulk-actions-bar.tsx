"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Wand2, X, Loader2, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { ReviewModal } from "./review-modal";

interface BulkActionsBarProps {
  selectedIds: Set<number>;
  productNames: Map<number, string>;
  onClear: () => void;
  onComplete: () => void;
}

export function BulkActionsBar({
  selectedIds,
  productNames,
  onClear,
  onComplete,
}: BulkActionsBarProps) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [suggestions, setSuggestions] = useState<
    Array<{ id: number; current: string; suggestion: string }>
  >([]);
  const [reviewing, setReviewing] = useState<{
    id: number;
    current: string;
    suggestion: string;
  } | null>(null);

  const ids = Array.from(selectedIds);
  const total = ids.length;

  async function handleBulkTitles() {
    setProcessing(true);
    setProgress(0);
    const results: Array<{
      id: number;
      current: string;
      suggestion: string;
    }> = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const currentTitle = productNames.get(id) || "";
      setCurrentIdx(i);

      try {
        const res = await fetch("/api/ai/improve-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentTitle }),
        });

        if (res.ok) {
          const data = await res.json();
          results.push({
            id,
            current: currentTitle,
            suggestion: data.suggestion,
          });
        }
      } catch {
        // Skip failed products
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setSuggestions(results);
    setProcessing(false);

    if (results.length > 0) {
      // Start reviewing first one
      setReviewing(results[0]);
    } else {
      toast.error("Geen suggesties gegenereerd");
    }
  }

  async function handleApproveSuggestion(finalText: string) {
    if (!reviewing) return;

    try {
      await fetch(`/api/wp/products/${reviewing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalText }),
      });
      toast.success(`Product ${reviewing.id} bijgewerkt!`);
    } catch {
      toast.error(`Fout bij product ${reviewing.id}`);
    }

    // Move to next suggestion
    const currentSuggestionIdx = suggestions.findIndex(
      (s) => s.id === reviewing.id
    );
    const nextIdx = currentSuggestionIdx + 1;

    if (nextIdx < suggestions.length) {
      setReviewing(suggestions[nextIdx]);
    } else {
      setReviewing(null);
      setSuggestions([]);
      toast.success(`${suggestions.length} producten bijgewerkt!`);
      onComplete();
    }
  }

  function handleSkipReview() {
    if (!reviewing) return;
    const currentSuggestionIdx = suggestions.findIndex(
      (s) => s.id === reviewing.id
    );
    const nextIdx = currentSuggestionIdx + 1;

    if (nextIdx < suggestions.length) {
      setReviewing(suggestions[nextIdx]);
    } else {
      setReviewing(null);
      setSuggestions([]);
      onComplete();
    }
  }

  if (selectedIds.size === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-xl">
          <span className="text-sm font-medium">
            {selectedIds.size} geselecteerd
          </span>

          <Button
            variant="default"
            size="sm"
            onClick={handleBulkTitles}
            disabled={processing}
            className="gap-2"
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {processing
              ? `${currentIdx + 1}/${total}`
              : "AI Verbeter Titels"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>

          {processing && (
            <Progress value={progress} className="w-24 h-2" />
          )}
        </div>
      </div>

      {/* Review modal for current suggestion */}
      {reviewing && (
        <ReviewModal
          open={!!reviewing}
          onClose={handleSkipReview}
          original={reviewing.current}
          suggested={reviewing.suggestion}
          label={`Titel (${suggestions.findIndex((s) => s.id === reviewing.id) + 1}/${suggestions.length})`}
          type="text"
          onApprove={handleApproveSuggestion}
        />
      )}
    </>
  );
}
