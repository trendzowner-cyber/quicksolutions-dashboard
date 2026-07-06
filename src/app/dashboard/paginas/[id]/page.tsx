import { getPage } from "@/lib/wp-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageAIButton } from "./page-ai-button";
import { AIRedesignPagina } from "@/components/paginas/ai-redesign-pagina";

export const dynamic = "force-dynamic";

export default async function PageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pageId = parseInt(id);

  let page: Record<string, unknown> | null = null;

  try {
    const result = await getPage(pageId);
    page = result.data;
  } catch {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/paginas">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Terug naar pagina&apos;s
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Pagina niet gevonden</p>
        </div>
      </div>
    );
  }

  if (!page) return null;

  const title = (page.title as { rendered: string })?.rendered || "";
  const content = (page.content as { rendered: string })?.rendered || "";
  const status = (page.status as string) || "draft";
  const link = (page.link as string) || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/paginas">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{title || "(geen titel)"}</h1>
            <Badge
              variant={status === "publish" ? "default" : "secondary"}
              className="text-xs mt-1"
            >
              {status === "publish" ? "Gepubliceerd" : "Concept"}
            </Badge>
          </div>
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Bekijk op site
            </Button>
          </a>
        )}
      </div>

      <Separator />

      <div
        className="prose prose-sm prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />

      <Separator />

      <PageAIButton pageId={pageId} title={title} content={content} />

      <div className="pt-4">
        <AIRedesignPagina
          pageId={pageId}
          currentTitle={title}
          currentContent={content}
        />
      </div>
    </div>
  );
}
