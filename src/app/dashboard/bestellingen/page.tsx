"use client";

import { useEffect, useState, useMemo } from "react";
import { OrdersTable } from "@/components/bestellingen/orders-table";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Calendar, X } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";

const FILTERS = [
  { key: "today", label: "Vandaag" },
  { key: "yesterday", label: "Gisteren" },
  { key: "last7", label: "Laatste 7 dagen" },
  { key: "last14", label: "Laatste 14 dagen" },
  { key: "last30", label: "Laatste 30 dagen" },
] as const;

function getDateRange(filter: string | null): { after?: string; before?: string } {
  if (!filter) return {};
  const now = new Date();
  const startOfDay = (d: Date) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const endOfDay = (d: Date) => {
    d.setHours(23, 59, 59, 999);
    return d;
  };

  switch (filter) {
    case "today": {
      const d = new Date();
      return { after: startOfDay(d).toISOString() };
    }
    case "yesterday": {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      const end = new Date();
      end.setDate(end.getDate() - 1);
      return {
        after: startOfDay(start).toISOString(),
        before: endOfDay(end).toISOString(),
      };
    }
    case "last7": {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { after: startOfDay(d).toISOString() };
    }
    case "last14": {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      return { after: startOfDay(d).toISOString() };
    }
    case "last30": {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { after: startOfDay(d).toISOString() };
    }
    default:
      return {};
  }
}

export default function BestellingenPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);

  const page = parseInt(searchParams.get("page") || "1");
  const activeFilter = searchParams.get("filter") || null;

  const dateRange = useMemo(() => getDateRange(activeFilter), [activeFilter]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("per_page", "20");
    params.set("page", String(page));
    params.set("orderby", "date");
    params.set("order", "desc");
    if (dateRange.after) params.set("after", dateRange.after);
    if (dateRange.before) params.set("before", dateRange.before);

    fetch(`/api/wp/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { setOrders(d.data || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, dateRange.after, dateRange.before]);

  function setFilter(filter: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (filter) {
      params.set("filter", filter);
    } else {
      params.delete("filter");
    }
    params.delete("page"); // reset to page 1 on filter change
    router.push(`/dashboard/bestellingen?${params.toString()}`);
  }

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

      {/* Date filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={activeFilter === f.key ? "default" : "outline"}
            size="sm"
            className={activeFilter === f.key ? "h-7 sm:h-8 text-[11px] sm:text-xs bg-brand hover:bg-brand/90" : "h-7 sm:h-8 text-[11px] sm:text-xs"}
            onClick={() => setFilter(activeFilter === f.key ? null : f.key)}
          >
            {f.label}
          </Button>
        ))}
        {activeFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1 text-muted-foreground"
            onClick={() => setFilter(null)}
          >
            <X className="h-3 w-3" /> Wis filter
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {total} bestellingen{activeFilter ? ` — ${FILTERS.find((f) => f.key === activeFilter)?.label}` : ""}
      </p>

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
