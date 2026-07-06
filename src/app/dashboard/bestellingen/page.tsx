"use client";

import { useEffect, useState } from "react";
import { OrdersTable } from "@/components/bestellingen/orders-table";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function BestellingenPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const page = parseInt(searchParams.get("page") || "1");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/wp/orders?per_page=20&page=${page}&orderby=date&order=desc`)
      .then((r) => r.json())
      .then((d) => { setOrders(d.data || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bestellingen</h1>
            <p className="text-muted-foreground">Beheer je WooCommerce bestellingen</p>
          </div>
          <a href="/api/wp/export-orders">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </a>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{total} bestellingen</p>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <>
          <OrdersTable orders={orders.map((o) => ({
            id: o.id as number, number: o.number as string, status: o.status as string,
            date_created: o.date_created as string, total: o.total as string,
            billing: (o.billing || {}) as { first_name: string; last_name: string },
            line_items: (o.line_items || []) as Array<{ name: string; quantity: number }>,
          }))} />
          <Pagination total={total} page={page} perPage={20} />
        </>
      )}
    </div>
  );
}
