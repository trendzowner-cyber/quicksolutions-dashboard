import { getPages } from "@/lib/wp-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, File } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PagesPage() {
  let pages: Array<Record<string, unknown>> = [];
  let total = 0;

  try {
    const result = await getPages({ per_page: "50" });
    pages = result.data;
    total = parseInt(result.headers.get("X-WP-Total") || "0");
  } catch {
    // empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pagina&apos;s</h1>
        <p className="text-muted-foreground">
          Beheer je WordPress pagina&apos;s
        </p>
      </div>

      <p className="text-sm text-muted-foreground">{total} pagina&apos;s</p>

      {pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <File className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Geen pagina&apos;s gevonden</p>
        </div>
      ) : (
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
            {pages.map((page) => {
              const title =
                (page.title as { rendered: string })?.rendered || "";
              const status = (page.status as string) || "draft";
              const date = (page.date as string) || "";

              return (
                <TableRow key={page.id as number}>
                  <TableCell className="font-medium text-sm">
                    {title || "(geen titel)"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        status === "publish" ? "default" : "secondary"
                      }
                      className="text-xs"
                    >
                      {status === "publish" ? "Gepubliceerd" : "Concept"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {date
                      ? new Intl.DateTimeFormat("nl-BE", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }).format(new Date(date))
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/paginas/${page.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
