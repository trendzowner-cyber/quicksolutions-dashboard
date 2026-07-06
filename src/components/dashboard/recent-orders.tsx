"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface RecentOrder {
  id: number;
  number: string;
  customer: string;
  date: string;
  status: string;
  total: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  completed: { label: "Voltooid", variant: "default" },
  processing: { label: "In behandeling", variant: "default" },
  pending: { label: "In afwachting", variant: "secondary" },
  "on-hold": { label: "In wacht", variant: "destructive" },
  cancelled: { label: "Geannuleerd", variant: "outline" },
  failed: { label: "Mislukt", variant: "destructive" },
};

interface RecentOrdersProps {
  orders: RecentOrder[];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        Geen recente orders
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.slice(0, 5).map((order) => {
        const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
        return (
          <Link
            key={order.id}
            href={`/dashboard/bestellingen/${order.id}`}
            className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {order.customer}
              </p>
              <p className="text-xs text-muted-foreground">
                {order.number} ·{" "}
                {new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(
                  new Date(order.date)
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={st.variant} className="text-xs">
                {st.label}
              </Badge>
              <span className="text-sm font-medium">€{order.total}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
