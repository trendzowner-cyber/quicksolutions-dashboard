import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PostsTable } from "@/components/blog/posts-table";
import { BlogIdeasPanel } from "@/components/blog/blog-ideas-panel";
import { Pagination } from "@/components/shared/pagination";
import { getPosts } from "@/lib/wp-client";
import { Suspense } from "react";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

interface BlogPageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

async function BlogList({ searchParams }: BlogPageProps) {
  const params = await searchParams;
  const queryParams: Record<string, string> = { per_page: "20" };
  if (params.search) queryParams.search = params.search;
  if (params.page) queryParams.page = params.page;

  let posts: Array<Record<string, unknown>> = [];
  let total = 0;

  try {
    const result = await getPosts(queryParams);
    posts = result.data;
    total = parseInt(result.headers.get("X-WP-Total") || "0");
  } catch {
    // empty state
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">{total} blog posts</p>
      <PostsTable
        posts={
          posts.map((p) => ({
            id: p.id as number,
            title: p.title as { rendered: string },
            status: p.status as string,
            date: p.date as string,
            excerpt: p.excerpt as { rendered: string },
          }))
        }
      />
    </>
  );
}

export default function BlogPage(props: BlogPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Blog</h1>
          <p className="text-muted-foreground">
            Beheer blog posts met AI-content generatie
          </p>
        </div>
        <Link href="/dashboard/blog/nieuw">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nieuw Artikel
          </Button>
        </Link>
      </div>

      <Suspense fallback={<PostsTable posts={[]} loading />}>
        <BlogList searchParams={props.searchParams} />
      </Suspense>

      <div className="pt-6 border-t border-border">
        <h2 className="text-lg font-semibold mb-4">Blog Ideeën</h2>
        <BlogIdeasPanel />
      </div>
    </div>
  );
}
