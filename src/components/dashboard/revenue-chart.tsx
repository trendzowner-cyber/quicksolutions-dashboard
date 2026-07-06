"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { WCOrder } from "@/types/woocommerce";

interface RevenueChartProps {
  orders: WCOrder[];
}

export function RevenueChart({ orders }: RevenueChartProps) {
  const data = useMemo(() => {
    const monthly: Record<string, number> = {};
    const now = new Date();

    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("nl-BE", { month: "short", year: "2-digit" });
      monthly[key] = 0;
    }

    orders.forEach((o) => {
      if (o.status !== "completed" && o.status !== "processing") return;
      const d = new Date(o.date_created);
      const key = d.toLocaleDateString("nl-BE", { month: "short", year: "2-digit" });
      if (key in monthly) {
        monthly[key] += parseFloat(o.total) || 0;
      }
    });

    return Object.entries(monthly).map(([month, revenue]) => ({
      month,
      revenue: Math.round(revenue),
    }));
  }, [orders]);

  if (data.every((d) => d.revenue === 0)) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Nog geen omzetgegevens
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground text-xs"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          className="text-muted-foreground text-xs"
          tickFormatter={(v) => `€${v}`}
        />
        <Tooltip
          formatter={(value) => [`€${value}`, "Omzet"]}
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            fontSize: "13px",
          }}
        />
        <Bar
          dataKey="revenue"
          fill="var(--primary)"
          radius={[4, 4, 0, 0]}
          className="fill-primary"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
