import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, SearchCheck, Package } from "lucide-react";

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/dashboard/blog/nieuw">
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          Nieuw Blog Artikel
        </Button>
      </Link>
      <Link href="/dashboard/producten">
        <Button variant="outline" size="sm" className="gap-2">
          <Package className="h-4 w-4" />
          Bekijk Producten
        </Button>
      </Link>
      <Link href="/dashboard/audit">
        <Button variant="outline" size="sm" className="gap-2">
          <SearchCheck className="h-4 w-4" />
          Start Site Audit
        </Button>
      </Link>
    </div>
  );
}
