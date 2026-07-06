"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { OrderStatusChart } from "@/components/dashboard/order-status-chart";
import { TopProducts } from "@/components/dashboard/top-products";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import type { WCOrder } from "@/types/woocommerce";

interface DashboardChartsProps {
  orders: WCOrder[];
}

export function DashboardCharts({
  orders,
}: DashboardChartsProps) {
  const productSales = useMemo(() => {
    const sales: Record<string, { name: string; count: number; revenue: number }> = {};
    orders
      .filter((o) => o.status === "completed" || o.status === "processing")
      .forEach((o) => {
        o.line_items?.forEach((item) => {
          const key = item.product_id?.toString() || item.name;
          if (!sales[key]) {
            sales[key] = { name: item.name, count: 0, revenue: 0 };
          }
          sales[key].count += item.quantity;
          sales[key].revenue += parseFloat(item.total) || 0;
        });
      });

    return Object.values(sales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [orders]);

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          <p>Nog geen ordergegevens beschikbaar.</p>
          <p className="text-sm mt-1">
            Charts verschijnen zodra er orders binnenkomen.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omzet (6m)</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart orders={orders} />
        </CardContent>
      </Card>

      {/* Order status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Status</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusChart orders={orders} />
        </CardContent>
      </Card>

      {/* Top products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Producten</CardTitle>
        </CardHeader>
        <CardContent>
          <TopProducts products={productSales} />
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recente Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentOrders
            orders={orders.slice(0, 5).map((o) => ({
              id: o.id,
              number: o.number,
              customer:
                o.billing?.first_name || o.billing?.last_name
                  ? `${o.billing.first_name} ${o.billing.last_name}`
                  : "Gast",
              date: o.date_created,
              status: o.status,
              total: parseFloat(o.total || "0").toFixed(2),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
