"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface AISEOButtonProps {
  productId: number;
  title: string;
  description: string;
  onUpdated: () => void;
}

export function AISEOButton({
  productId,
  title,
  description,
  onUpdated,
}: AISEOButtonProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    metaDescription: string;
    focusKeyphrase: string;
    seoTitle: string;
  } | null>(null);
  const [showReview, setShowReview] = useState(false);

  // Editable versions
  const [editMeta, setEditMeta] = useState("");
  const [editKeyphrase, setEditKeyphrase] = useState("");
  const [editSeoTitle, setEditSeoTitle] = useState("");

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/seo-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      setSuggestion(data);
      setEditMeta(data.metaDescription);
      setEditKeyphrase(data.focusKeyphrase);
      setEditSeoTitle(data.seoTitle);
      setShowReview(true);
    } catch {
      toast.error("Fout bij genereren van SEO meta");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    setSaving(true);
    try {
      // Update Yoast SEO meta via WordPress meta fields
      // Note: Yoast REST API may not update products directly.
      // We store the values via WooCommerce meta as fallback.
      await fetch(`/api/wp/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta_data: [
            { key: "_yoast_wpseo_metadesc", value: editMeta },
            { key: "_yoast_wpseo_focuskw", value: editKeyphrase },
            { key: "_yoast_wpseo_title", value: editSeoTitle },
          ],
        }),
      });

      toast.success("SEO meta bijgewerkt!");
      setShowReview(false);
      onUpdated();
    } catch {
      toast.error("Fout bij bijwerken SEO meta");
    } finally {
      setSaving(false);
    }
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
        {loading ? "Bezig..." : "AI Genereer SEO Meta"}
      </Button>

      <Dialog open={showReview} onOpenChange={(o) => !o && setShowReview(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>SEO Meta Gegevens</DialogTitle>
            <DialogDescription>
              Bekijk en bewerk de gegenereerde SEO metadata.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seo-title">SEO Titel</Label>
              <Input
                id="seo-title"
                value={editSeoTitle}
                onChange={(e) => setEditSeoTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-desc">Meta Beschrijving</Label>
              <Input
                id="meta-desc"
                value={editMeta}
                onChange={(e) => setEditMeta(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {editMeta.length}/156 karakters
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="focus-kw">Focus Keyphrase</Label>
              <Input
                id="focus-kw"
                value={editKeyphrase}
                onChange={(e) => setEditKeyphrase(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReview(false)}>
              Annuleren
            </Button>
            <Button
              onClick={handleApply}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Toepassen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
