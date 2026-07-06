import { getProducts } from "@/lib/wp-client";
import { ProductTable } from "@/components/products/product-table";
import { ProductFilters } from "@/components/products/product-filters";
import { Pagination } from "@/components/shared/pagination";
import { ProductClientWrapper } from "./product-client-wrapper";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface ProductenPageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

async function ProductList({ searchParams }: ProductenPageProps) {
  const params = await searchParams;
  const queryParams: Record<string, string> = { per_page: "20" };
  if (params.search) queryParams.search = params.search;
  if (params.page) queryParams.page = params.page;

  let products: Array<Record<string, unknown>> = [];
  let total = 0;

  try {
    const result = await getProducts(queryParams);
    products = result.data;
    total = parseInt(result.headers.get("X-WP-Total") || "0");
  } catch {}

  return (
    <div className="space-y-4">
      <ProductFilters />
      <p className="text-sm text-muted-foreground">{total} producten</p>
      <ProductClientWrapper
        products={products.map((p) => ({
          id: p.id as number,
          name: p.name as string,
          price: p.price as string,
          stock_status: p.stock_status as string,
          categories: p.categories as Array<{ id: number; name: string }>,
          images: p.images as Array<{ src: string; alt: string }>,
        }))}
      />
      <Pagination total={total} page={parseInt(params.page || "1")} perPage={20} />
    </div>
  );
}

export default function ProductenPage(props: ProductenPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Producten</h1>
        <p className="text-muted-foreground">Beheer je WooCommerce producten met AI-assistentie</p>
      </div>
      <Suspense
        fallback={<ProductTable products={[]} loading selectedIds={new Set()} onSelectionChange={() => {}} />}
      >
        <ProductList searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
