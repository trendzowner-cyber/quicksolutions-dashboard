"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ProductTable } from "@/components/products/product-table";
import { ProductFilters } from "@/components/products/product-filters";
import { Pagination } from "@/components/shared/pagination";

interface Product {
  id: number;
  name: string;
  price: string;
  stock_status: string;
  categories: Array<{ id: number; name: string }>;
  images: Array<{ src: string; alt: string }>;
}

export function ProductenContent() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const page = parseInt(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";

  useEffect(() => {
    setLoading(true);
    fetch(`/api/wp/products?${new URLSearchParams({ per_page: "20", page: String(page), ...(search ? { search } : {}) })}`)
      .then(async (res) => {
        const data = await res.json();
        setProducts(data.data.map((p: Record<string, unknown>) => ({
          id: p.id as number,
          name: p.name as string,
          price: p.price as string,
          stock_status: p.stock_status as string,
          categories: (p.categories || []) as Array<{ id: number; name: string }>,
          images: (p.images || []) as Array<{ src: string; alt: string }>,
        })));
        setTotal(data.total || 0);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [page, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Producten</h1>
        <p className="text-muted-foreground">Beheer je WooCommerce producten met AI-assistentie</p>
      </div>
      <div className="space-y-4">
        <ProductFilters />
        <p className="text-sm text-muted-foreground">{total} producten</p>
        <ProductTable products={products} loading={loading} selectedIds={[]} onSelectionChange={() => {}} />
        <Pagination total={total} page={page} perPage={20} />
      </div>
    </div>
  );
}
