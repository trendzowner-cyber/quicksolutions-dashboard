"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ImageIcon, Loader2, Check } from "lucide-react";

interface AIAltTextProps {
  productId: number;
  productName: string;
  imageUrl: string;
  currentAlt: string;
  onUpdated: () => void;
}

export function AIAltText({ productId, productName, currentAlt, onUpdated }: AIAltTextProps) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState("");

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/alt-text", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, imageUrl: "" }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setGenerated(data.altText);
      toast.success("Alt-tekst gegenereerd!");
    } catch { toast.error("Fout bij genereren"); }
    finally { setLoading(false); }
  }

  async function handleApply() {
    try {
      await fetch(`/api/wp/products/${productId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [{ alt: generated }] }),
      });
      toast.success("Alt-tekst bijgewerkt!");
      onUpdated();
    } catch { toast.error("Fout bij bijwerken"); }
  }

  return (
    <div className="space-y-2">
      {currentAlt ? (
        <p className="text-xs text-muted-foreground">Alt: {currentAlt}</p>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400">Geen alt-tekst aanwezig</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading} className="gap-1 text-xs h-7">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
          {loading ? "..." : "AI Alt-Text"}
        </Button>
        {generated && (
          <>
            <span className="text-xs text-muted-foreground truncate flex-1 self-center">{generated}</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleApply}>
              <Check className="h-3 w-3" /> Toepassen
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
