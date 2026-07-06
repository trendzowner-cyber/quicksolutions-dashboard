"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PostsTable } from "@/components/blog/posts-table";
import { BlogIdeasPanel } from "@/components/blog/blog-ideas-panel";
import { Pagination } from "@/components/shared/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function BlogPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const page = parseInt(searchParams.get("page") || "1");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/wp/posts?per_page=20&page=${page}`)
      .then((r) => r.json())
      .then((d) => { setPosts(d.data || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Blog</h1>
          <p className="text-muted-foreground">Beheer blog posts met AI-content generatie</p>
        </div>
        <Link href="/dashboard/blog/nieuw"><Button className="gap-2"><Plus className="h-4 w-4" />Nieuw Artikel</Button></Link>
      </div>
      <p className="text-sm text-muted-foreground">{total} blog posts</p>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <>
          <PostsTable posts={posts.map((p) => ({
            id: p.id as number, title: p.title as { rendered: string },
            status: p.status as string, date: p.date as string,
            excerpt: p.excerpt as { rendered: string },
          }))} />
          <Pagination total={total} page={page} perPage={20} />
        </>
      )}
      <div className="pt-6 border-t border-border">
        <h2 className="text-lg font-semibold mb-4">Blog Ideeën</h2>
        <BlogIdeasPanel />
      </div>
    </div>
  );
}
