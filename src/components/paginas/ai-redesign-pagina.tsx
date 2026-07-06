"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface AIRedesignPaginaProps {
  pageId: number;
  currentTitle: string;
  currentContent: string;
}

export function AIRedesignPagina({
  pageId,
  currentTitle,
  currentContent,
}: AIRedesignPaginaProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedHTML, setGeneratedHTML] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Voer een prompt in");
      return;
    }

    setGenerating(true);
    setGeneratedHTML(null);

    try {
      const res = await fetch("/api/ai/redesign-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          title: currentTitle,
          content: currentContent,
          prompt: prompt.trim(),
        }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setGeneratedHTML(data.content);
      toast.success("Pagina herontwerp gegenereerd!");
    } catch {
      toast.error("Fout bij herontwerpen pagina");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!generatedHTML) return;
    setSaving(true);

    try {
      await fetch(`/api/wp/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: generatedHTML }),
      });

      toast.success("Pagina bijgewerkt en gepubliceerd!");
      router.refresh();
    } catch {
      toast.error("Fout bij publiceren pagina");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Prompt Input */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <Label htmlFor="redesign-prompt" className="text-sm font-semibold">
          AI Herontwerp Prompt
        </Label>
        <p className="text-xs text-muted-foreground">
          Beschrijf hoe je de pagina wilt veranderen. De AI behoudt automatisch
          alle originele contactgegevens, adressen, telefoonnummers en andere
          bedrijfsinformatie.
        </p>
        <Textarea
          id="redesign-prompt"
          placeholder="Bijv: Maak deze pagina moderner met een hero section, blauwe gradient achtergrond, cards voor onze diensten, en zet het telefoonnummer prominent bovenaan."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <Button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="gap-2 w-full"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              AI herontwerpt de pagina...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Genereer Herontwerp
            </>
          )}
        </Button>
      </div>

      {/* Preview */}
      {generatedHTML && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Voorbeeld</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGeneratedHTML(null)}
                className="gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Opnieuw
              </Button>
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={saving}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <Save className="h-3 w-3" />
                {saving ? "Publiceren..." : "Publiceren"}
              </Button>
            </div>
          </div>

          {/* Rendered preview */}
          <div className="rounded-xl border border-emerald-500/30 overflow-hidden">
            <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20">
              <p className="text-xs text-emerald-400 font-medium">
                AI Herontwerp — Live Preview
              </p>
            </div>
            <div className="bg-white">
              <iframe
                srcDoc={generatedHTML}
                className="w-full h-[500px] border-0"
                title="AI Pagina Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
