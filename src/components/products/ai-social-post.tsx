"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Share2, Loader2, Copy, Check } from "lucide-react";

interface AISocialPostProps {
  productName: string;
  price: string;
  description: string;
  permalink: string;
}

export function AISocialPost({ productName, price, description, permalink }: AISocialPostProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ facebook: string; instagram: string; hashtags: string[] } | null>(null);
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/social-post", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, price, description, permalink }),
      });
      if (!res.ok) throw new Error("API error");
      setResult(await res.json());
    } catch { toast.error("Fout bij genereren"); }
    finally { setLoading(false); }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied((p) => ({ ...p, [key]: true }));
    toast.success("Gekopieerd!");
    setTimeout(() => setCopied((p) => ({ ...p, [key]: false })), 2000);
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading} className="gap-2 w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        {loading ? "Genereert..." : "AI Social Media Post"}
      </Button>
      {result && (
        <div className="space-y-3">
          {(["facebook","instagram"] as const).map((platform) => (
            <Card key={platform} className="border-border">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{platform}</span>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => copyText(result[platform], platform)}>
                    {copied[platform] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied[platform] ? "Gekopieerd" : "Kopieer"}
                  </Button>
                </div>
                <p className="text-sm">{result[platform]}</p>
              </CardContent>
            </Card>
          ))}
          {result.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.hashtags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
