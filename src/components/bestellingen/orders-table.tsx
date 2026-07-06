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
import { Eye, ShoppingCart } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  completed: { label: "Voltooid", variant: "default" },
  processing: { label: "In behandeling", variant: "default" },
  pending: { label: "In afwachting", variant: "secondary" },
  "on-hold": { label: "In wacht", variant: "destructive" },
  cancelled: { label: "Geannuleerd", variant: "outline" },
  failed: { label: "Mislukt", variant: "destructive" },
  refunded: { label: "Terugbetaald", variant: "outline" },
};

interface Order {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  billing: { first_name: string; last_name: string };
  line_items: Array<{ name: string; quantity: number }>;
}

interface OrdersTableProps {
  orders: Order[];
  loading?: boolean;
}

export function OrdersTable({ orders, loading }: OrdersTableProps) {
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

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShoppingCart className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Geen bestellingen gevonden</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Klant</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Datum</TableHead>
          <TableHead className="text-right">Totaal</TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
          return (
            <TableRow key={order.id}>
              <TableCell className="font-medium text-sm">
                {order.number}
              </TableCell>
              <TableCell className="text-sm">
                {order.billing?.first_name
                  ? `${order.billing.first_name} ${order.billing.last_name}`
                  : "Gast"}
              </TableCell>
              <TableCell>
                <Badge variant={st.variant} className="text-xs">
                  {st.label}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Intl.DateTimeFormat("nl-BE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(order.date_created))}
              </TableCell>
              <TableCell className="text-sm text-right font-medium">
                €{parseFloat(order.total).toFixed(2).replace(".", ",")}
              </TableCell>
              <TableCell>
                <Link href={`/dashboard/bestellingen/${order.id}`}>
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
  );
}
