"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  SearchCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import type { AuditIssue } from "@/types/audit";

const STEPS = [
  { label: "Producten ophalen...", key: "products" },
  { label: "Blog posts ophalen...", key: "posts" },
  { label: "Pagina's ophalen...", key: "pages" },
  { label: "AI analyse...", key: "ai" },
];

export default function AuditPage() {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [scanned, setScanned] = useState({ products: 0, posts: 0, pages: 0 });

  async function handleStartAudit() {
    setScanning(true);
    setIssues([]);
    setProgress(0);
    setCurrentStep(0);

    try {
      // Step 1: Fetch products
      setCurrentStep(0);
      const prodRes = await fetch("/api/wp/products?per_page=100");
      const prodData = await prodRes.json();
      const products = prodData.data || [];
      setScanned((s) => ({ ...s, products: products.length }));
      setProgress(15);

      // Step 2: Fetch posts
      setCurrentStep(1);
      const postRes = await fetch("/api/wp/posts?per_page=50");
      const postData = await postRes.json();
      const posts = postData.data || [];
      setScanned((s) => ({ ...s, posts: posts.length }));
      setProgress(30);

      // Step 3: Fetch pages
      setCurrentStep(2);
      const pageRes = await fetch("/api/wp/pages?per_page=50");
      const pageData = await pageRes.json();
      const pages = pageData.data || [];
      setScanned((s) => ({ ...s, pages: pages.length }));
      setProgress(40);

      // Step 4: Quick local checks (no AI needed for basic issues)
      setCurrentStep(3);
      const localIssues: AuditIssue[] = [];

      // Quick check: products
      for (const p of products.slice(0, 100)) {
        if (!p.short_description || (typeof p.short_description === "string" && p.short_description.length < 20)) {
          localIssues.push({
            itemId: p.id,
            itemType: "product",
            itemTitle: p.name,
            severity: "high",
            category: "short_content",
            description: "Korte beschrijving ontbreekt of is te kort",
            suggestion: "Voeg een korte beschrijving toe van minstens 20 karakters",
          });
        }
        if (!p.description || (typeof p.description === "string" && p.description.length < 50)) {
          localIssues.push({
            itemId: p.id,
            itemType: "product",
            itemTitle: p.name,
            severity: "medium",
            category: "short_content",
            description: "Volledige beschrijving ontbreekt of is erg kort",
            suggestion: "Voeg een uitgebreide productbeschrijving toe (150+ woorden)",
          });
        }
        if (!p.images || p.images.length === 0) {
          localIssues.push({
            itemId: p.id,
            itemType: "product",
            itemTitle: p.name,
            severity: "medium",
            category: "no_image",
            description: "Geen productafbeelding",
            suggestion: "Upload minstens één productafbeelding",
          });
        }
      }
      setProgress(70);

      // Step 5: Quick checks for posts
      for (const p of posts.slice(0, 50)) {
        const title = p.title?.rendered || "";
        if (title.length < 30) {
          localIssues.push({
            itemId: p.id,
            itemType: "post",
            itemTitle: title,
            severity: "low",
            category: "bad_title",
            description: "Blog titel is vrij kort (minder dan 30 karakters)",
            suggestion: "Overweeg een langere, meer beschrijvende titel met keywords",
          });
        }
      }
      setProgress(85);

      // Step 6: Deep AI check for a sample (first 10 of each type)
      const aiItems = [
        ...products.slice(0, 10).map((p: Record<string, unknown>) => ({
          id: p.id,
          type: "product",
          title: p.name,
          metaDescription: "",
          contentLength: (typeof p.description === "string" ? p.description.length : 0) || 0,
        })),
        ...posts.slice(0, 10).map((p: Record<string, unknown>) => ({
          id: p.id,
          type: "post",
          title: (p.title as { rendered: string })?.rendered || "",
          metaDescription: (p.yoast_head_json as { description?: string })?.description || "",
          contentLength: (typeof (p.content as { rendered: string })?.rendered === "string" ? (p.content as { rendered: string }).rendered.length : 0) || 0,
        })),
      ];

      if (aiItems.length > 0) {
        try {
          const aiRes = await fetch("/api/ai/full-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: aiItems }),
          });
          const aiData = await aiRes.json();
          if (aiData.issues?.length > 0) {
            localIssues.push(...aiData.issues);
          }
        } catch {
          // AI audit is optional
        }
      }
      setProgress(100);

      setIssues(localIssues);

      const highCount = localIssues.filter((i) => i.severity === "high").length;
      const medCount = localIssues.filter((i) => i.severity === "medium").length;
      const lowCount = localIssues.filter((i) => i.severity === "low").length;

      toast.success(
        `Audit voltooid: ${localIssues.length} issues gevonden (${highCount} hoog, ${medCount} medium, ${lowCount} laag)`
      );
    } catch {
      toast.error("Fout tijdens audit");
    } finally {
      setScanning(false);
    }
  }

  const highCount = issues.filter((i) => i.severity === "high").length;
  const medCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SEO Audit</h1>
        <p className="text-muted-foreground">
          Volledige site scan op SEO problemen
        </p>
      </div>

      {!scanning && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <SearchCheck className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">
            Start een volledige site audit
          </h2>
          <p className="text-muted-foreground max-w-md mb-6">
            Scan alle producten, blog posts en pagina&apos;s op SEO problemen
            zoals ontbrekende meta descriptions, korte content, en
            optimalisatiekansen.
          </p>
          <Button size="lg" onClick={handleStartAudit} className="gap-2">
            <SearchCheck className="h-5 w-5" />
            Start Volledige Scan
          </Button>
        </div>
      )}

      {scanning && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="font-medium">Audit bezig...</p>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="space-y-2">
              {STEPS.map((step, i) => (
                <div key={step.key} className="flex items-center gap-2">
                  {i < currentStep ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : i === currentStep ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-border" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {issues.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{issues.length}</p>
                <p className="text-sm text-muted-foreground">Totaal Issues</p>
              </CardContent>
            </Card>
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-red-400">{highCount}</p>
                <p className="text-sm text-muted-foreground">Hoge Prioriteit</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-yellow-400">
                  {medCount}
                </p>
                <p className="text-sm text-muted-foreground">Medium</p>
              </CardContent>
            </Card>
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-blue-400">{lowCount}</p>
                <p className="text-sm text-muted-foreground">Laag</p>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Issues List */}
          <div className="space-y-3">
            {issues.map((issue, i) => (
              <Card
                key={i}
                className={`border-border ${
                  issue.severity === "high"
                    ? "border-l-2 border-l-red-500"
                    : issue.severity === "medium"
                    ? "border-l-2 border-l-yellow-500"
                    : "border-l-2 border-l-blue-500"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            issue.severity === "high"
                              ? "destructive"
                              : issue.severity === "medium"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {issue.severity === "high"
                            ? "Hoog"
                            : issue.severity === "medium"
                            ? "Medium"
                            : "Laag"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {issue.itemType === "product"
                            ? "Product"
                            : issue.itemType === "post"
                            ? "Blog"
                            : "Pagina"}
                        </Badge>
                        <span className="text-sm font-medium">
                          {issue.itemTitle}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {issue.description}
                      </p>
                      <p className="text-sm text-emerald-400">
                        {issue.suggestion}
                      </p>
                    </div>
                    {issue.itemType === "product" && (
                      <Link href={`/dashboard/producten/${issue.itemId}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          Fix <ArrowUpRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                    {issue.itemType === "post" && (
                      <Link href={`/dashboard/blog/${issue.itemId}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          Fix <ArrowUpRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                    {issue.itemType === "page" && (
                      <Link href={`/dashboard/paginas/${issue.itemId}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          Fix <ArrowUpRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={handleStartAudit} className="gap-2">
              <SearchCheck className="h-4 w-4" />
              Scan Opnieuw
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
