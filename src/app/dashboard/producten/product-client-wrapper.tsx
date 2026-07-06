"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductTable } from "@/components/products/product-table";
import { BulkActionsBar } from "@/components/products/bulk-actions-bar";

interface Product {
  id: number;
  name: string;
  price: string;
  stock_status: string;
  categories: Array<{ id: number; name: string }>;
  images: Array<{ src: string; alt: string }>;
}

interface ProductClientWrapperProps {
  products: Product[];
}

export function ProductClientWrapper({ products }: ProductClientWrapperProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const router = useRouter();

  const productNames = new Map(products.map((p) => [p.id, p.name]));

  return (
    <>
      <ProductTable
        products={products}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onProductUpdate={() => router.refresh()}
      />
      <BulkActionsBar
        selectedIds={selectedIds}
        productNames={productNames}
        onClear={() => setSelectedIds([])}
        onComplete={() => {
          setSelectedIds([]);
          router.refresh();
        }}
      />
    </>
  );
}
