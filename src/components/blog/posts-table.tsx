"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, FileText } from "lucide-react";

interface Post {
  id: number;
  title: { rendered: string };
  status: string;
  date: string;
  excerpt: { rendered: string };
}

interface PostsTableProps {
  posts: Post[];
  loading?: boolean;
}

export function PostsTable({ posts, loading }: PostsTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Geen blog posts gevonden</p>
      </div>
    );
  }

  function formatDate(dateStr: string) {
    return new Intl.DateTimeFormat("nl-BE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(dateStr));
  }

  function stripHtml(html: string) {
    return html?.replace(/<[^>]*>/g, "").slice(0, 150) || "";
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titel</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Datum</TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.map((post) => (
          <TableRow key={post.id}>
            <TableCell>
              <div>
                <p className="font-medium text-sm">
                  {post.title?.rendered || "(geen titel)"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {stripHtml(post.excerpt?.rendered || "")}
                </p>
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant={post.status === "publish" ? "default" : "secondary"}
                className="text-xs"
              >
                {post.status === "publish" ? "Gepubliceerd" : "Concept"}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(post.date)}
            </TableCell>
            <TableCell>
              <Link href={`/dashboard/blog/${post.id}`}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Eye className="h-4 w-4" />
                </Button>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
