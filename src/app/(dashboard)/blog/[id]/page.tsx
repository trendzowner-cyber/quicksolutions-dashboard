import { getPost, updatePost } from "@/lib/wp-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { BlogPostActions } from "./blog-post-actions";

export const dynamic = "force-dynamic";

export default async function BlogPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = parseInt(id);

  let post: Record<string, unknown> | null = null;

  try {
    const result = await getPost(postId);
    post = result.data;
  } catch {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/blog">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Terug naar blog
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Blog post niet gevonden</p>
        </div>
      </div>
    );
  }

  if (!post) return null;

  const title = (post.title as { rendered: string })?.rendered || "";
  const content = (post.content as { rendered: string })?.rendered || "";
  const excerpt = (post.excerpt as { rendered: string })?.rendered || "";
  const status = (post.status as string) || "draft";
  const link = (post.link as string) || "";
  const date = (post.date as string) || "";
  const yoast =
    (post.yoast_head_json as {
      title?: string;
      description?: string;
    }) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/blog">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">
              {title || "(geen titel)"}
            </h1>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge
                variant={status === "publish" ? "default" : "secondary"}
                className="text-xs"
              >
                {status === "publish" ? "Gepubliceerd" : "Concept"}
              </Badge>
              {date && (
                <span className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("nl-BE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }).format(new Date(date))}
                </span>
              )}
            </div>
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

      {yoast && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1">SEO Titel</p>
            <p className="text-sm">{yoast.title || "(niet ingesteld)"}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-1">
              Meta Beschrijving
            </p>
            <p className="text-sm">
              {yoast.description || "(niet ingesteld)"}
            </p>
          </div>
        </div>
      )}

      <Separator />

      {/* Content */}
      <div
        className="prose prose-sm prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: content }}
      />

      {/* AI Optimize */}
      <Separator />
      <BlogPostActions postId={postId} title={title} content={content} />
    </div>
  );
}
