import { getOrders } from "@/lib/wp-client";
import { OrdersTable } from "@/components/bestellingen/orders-table";
import { Pagination } from "@/components/shared/pagination";

export const dynamic = "force-dynamic";

interface BestellingenPageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function BestellingenPage({
  searchParams,
}: BestellingenPageProps) {
  const params = await searchParams;
  const queryParams: Record<string, string> = {
    per_page: "20",
    orderby: "date",
    order: "desc",
  };
  if (params.search) queryParams.search = params.search;
  if (params.page) queryParams.page = params.page;

  let orders: Array<Record<string, unknown>> = [];
  let total = 0;

  try {
    const result = await getOrders(queryParams);
    orders = result.data;
    total = parseInt(result.headers.get("X-WP-Total") || "0");
  } catch {
    // empty
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bestellingen</h1>
        <p className="text-muted-foreground">
          Beheer je WooCommerce bestellingen
        </p>
      </div>

      <p className="text-sm text-muted-foreground">{total} bestellingen</p>

      <OrdersTable
        orders={orders.map((o) => ({
          id: o.id as number,
          number: o.number as string,
          status: o.status as string,
          date_created: o.date_created as string,
          total: o.total as string,
          billing: (o.billing || {}) as {
            first_name: string;
            last_name: string;
          },
          line_items: (o.line_items || []) as Array<{
            name: string;
            quantity: number;
          }>,
        }))}
      />
    </div>
  );
}
