"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wand2, Loader2, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function AICreatePagina() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<{
    title: string;
    content: string;
    metaDescription: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    if (!title.trim() || !prompt.trim()) {
      toast.error("Vul een titel en prompt in");
      return;
    }

    setGenerating(true);
    setGeneratedData(null);

    try {
      const res = await fetch("/api/ai/create-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), prompt: prompt.trim() }),
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setGeneratedData(data);
      toast.success("Nieuwe pagina gegenereerd!");
    } catch {
      toast.error("Fout bij genereren pagina");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!generatedData) return;
    setSaving(true);

    try {
      const res = await fetch("/api/wp/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: generatedData.title,
          content: generatedData.content,
          status: "publish",
          meta: {
            _yoast_wpseo_metadesc: generatedData.metaDescription,
          },
        }),
      });

      if (!res.ok) throw new Error("API error");

      const page = await res.json();
      toast.success("Nieuwe pagina gepubliceerd!");
      setOpen(false);
      router.push(`/dashboard/paginas/${page.id}`);
      router.refresh();
    } catch {
      toast.error("Fout bij publiceren pagina");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nieuwe Pagina
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe Pagina met AI</DialogTitle>
          <DialogDescription>
            Geef een titel en beschrijf wat voor pagina je wilt. De AI
            genereert de volledige HTML.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!generatedData && (
            <>
              <div className="space-y-2">
                <Label htmlFor="page-title">Pagina Titel</Label>
                <Input
                  id="page-title"
                  placeholder="Bijv: Over Ons"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="page-prompt">
                  Beschrijf de pagina
                </Label>
                <Textarea
                  id="page-prompt"
                  placeholder="Bijv: Een professionele over ons pagina met onze missie, het team, openingstijden, contactgegevens, en een blauw-wit kleurenschema."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || !title.trim() || !prompt.trim()}
                className="gap-2 w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI genereert pagina...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Genereer Pagina
                  </>
                )}
              </Button>
            </>
          )}

          {generatedData && (
            <>
              <div>
                <p className="text-sm font-medium mb-1">{generatedData.title}</p>
                <p className="text-xs text-muted-foreground">
                  {generatedData.metaDescription}
                </p>
              </div>
              <div className="rounded-xl border overflow-hidden">
                <div className="bg-emerald-500/10 px-3 py-1.5">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Preview
                  </p>
                </div>
                <div className="bg-white h-60 overflow-hidden relative">
                  <iframe
                    srcDoc={generatedData.content}
                    className="w-full h-60 border-0"
                    title="Preview"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setGeneratedData(null)}
                  className="flex-1"
                >
                  Opnieuw
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={saving}
                  className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Publiceren..." : "Publiceren"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
