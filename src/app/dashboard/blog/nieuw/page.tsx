"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PostEditor } from "@/components/blog/post-editor";
import { Loader2, Wand2, Save, Send, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

function NewBlogForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledTopic = searchParams.get("topic") || "";
  const prefilledKeywords = searchParams.get("keywords") || "";

  const [topic, setTopic] = useState(prefilledTopic);
  const [keywords, setKeywords] = useState(prefilledKeywords);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [seoData, setSeoData] = useState<Record<string, unknown> | null>(null);

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error("Voer een onderwerp in");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), keywords: keywords.trim() }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      setTitle(data.title);
      setContent(data.content);
      setExcerpt(data.excerpt || "");
      setSeoData({
        metaDescription: data.metaDescription || "",
        focusKeyphrase: data.focusKeyphrase || "",
        seoTitle: data.seoTitle || "",
        slug: data.slug || "",
        imageSuggestions: data.imageSuggestions || [],
        internalLinks: data.internalLinks || [],
        faqSchema: data.faqSchema || [],
        tags: data.tags || [],
        category: data.category || "",
      });
      toast.success("Blog post gegenereerd!");
    } catch {
      toast.error("Fout bij genereren blog post");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(status: "draft" | "publish") {
    setSaving(true);
    try {
      const res = await fetch("/api/wp/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          excerpt,
          status,
          meta: {
            _yoast_wpseo_metadesc: seoData?.metaDescription || "",
            _yoast_wpseo_focuskw: seoData?.focusKeyphrase || "",
          },
        }),
      });

      if (!res.ok) throw new Error("API error");

      const post = await res.json();
      toast.success(
        status === "publish" ? "Blog post gepubliceerd!" : "Blog post opgeslagen als concept"
      );
      router.push(`/dashboard/blog/${post.id}`);
    } catch {
      toast.error("Fout bij opslaan blog post");
    } finally {
      setSaving(false);
    }
  }

  const hasContent = title && content;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/blog">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nieuwe Blog Post</h1>
          <p className="text-muted-foreground">
            Genereer een AI-geschreven artikel in het Nederlands
          </p>
        </div>
      </div>

      {/* Step 1: Input */}
      {!hasContent && (
        <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="topic">Onderwerp of trefwoord</Label>
            <Input
              id="topic"
              placeholder="Bijv: Waarom een refurbished iPhone kopen?"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">
              Extra kernwoorden (optioneel, komma-gescheiden)
            </Label>
            <Input
              id="keywords"
              placeholder="Bijv: refurbished, iPhone 15, besparen, garantie"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
            className="gap-2 w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI schrijft de blog post...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Genereer met AI
              </>
            )}
          </Button>
        </div>
      )}

      {/* Step 2: Preview + Edit */}
      {hasContent && (
        <>
          {seoData && (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  Meta Beschrijving
                </p>
                <p className="text-sm">{seoData.metaDescription as string}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  Focus Keyphrase
                </p>
                <p className="text-sm font-medium">
                  {seoData.focusKeyphrase as string}
                </p>
              </div>
            </div>
            {/* Interne links are the part of "professional SEO" you cannot see
                in the rendered article — show exactly where they point. */}
            {Array.isArray(seoData.internalLinks) && seoData.internalLinks.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-1">Interne links</p>
                <ul className="space-y-0.5">
                  {(seoData.internalLinks as { anchorText: string; url: string }[]).map((l) => (
                    <li key={`${l.url}-${l.anchorText}`} className="text-xs truncate">
                      <span className="font-medium">{l.anchorText}</span>
                      <span className="text-muted-foreground"> → {l.url.replace(/^https?:\/\/[^/]+/, "")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </>
          )}

          <PostEditor
            title={title}
            content={content}
            excerpt={excerpt}
            onTitleChange={setTitle}
            onContentChange={setContent}
            onExcerptChange={setExcerpt}
          />

          <Separator />

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleSave("draft")}
              disabled={saving}
              variant="outline"
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Opslaan als Concept
            </Button>
            <Button
              onClick={() => handleSave("publish")}
              disabled={saving}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Send className="h-4 w-4" />
              Publiceren
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleGenerate()}
              disabled={generating}
              className="gap-2"
            >
              <Wand2 className="h-4 w-4" />
              Opnieuw Genereren
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function NewBlogPage() {
  return (
    <Suspense>
      <NewBlogForm />
    </Suspense>
  );
}
