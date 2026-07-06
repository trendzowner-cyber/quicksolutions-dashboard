import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getOrders } from "@/lib/wp-client";

export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Fetch all orders (up to 100)
    const { data } = await getOrders({ per_page: "100", orderby: "date", order: "desc" });
    const orders = data as Array<Record<string, unknown>>;

    // Build CSV
    const headers = ["Order #","Datum","Klant","Email","Status","Totaal","Betaalmethode","Producten"];
    const rows = orders.map((o) => {
      const billing = o.billing as Record<string, string> | undefined;
      const items = (o.line_items as Array<Record<string, unknown>>) || [];
      return [
        o.number as string,
        o.date_created as string,
        `${billing?.first_name || ""} ${billing?.last_name || ""}`.trim() || "Gast",
        (billing?.email as string) || "",
        o.status as string,
        o.total as string,
        (o.payment_method_title as string) || "",
        items.map((i) => `${i.name} x${i.quantity}`).join("; "),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const bom = "﻿"; // BOM for Excel UTF-8

    return new NextResponse(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="orders-export-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
