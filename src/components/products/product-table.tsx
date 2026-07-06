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
import { Eye, Package } from "lucide-react";

interface Product {
  id: number;
  name: string;
  price: string;
  stock_status: string;
  categories: Array<{ id: number; name: string }>;
  images: Array<{ src: string; alt: string }>;
}

interface ProductTableProps {
  products: Product[];
  loading?: boolean;
}

export function ProductTable({ products, loading }: ProductTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="h-10 w-10 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Geen producten gevonden</p>
      </div>
    );
  }

  function formatPrice(price: string) {
    if (!price || price === "0") return "—";
    return `€${parseFloat(price).toFixed(2).replace(".", ",")}`;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Img</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Prijs</TableHead>
          <TableHead>Voorraad</TableHead>
          <TableHead>Categorie</TableHead>
          <TableHead className="w-20"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell>
              {product.images?.[0]?.src ? (
                <img
                  src={product.images[0].src}
                  alt={product.name}
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </TableCell>
            <TableCell className="font-medium text-sm max-w-xs truncate">
              {product.name}
            </TableCell>
            <TableCell className="text-sm">
              {formatPrice(product.price)}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  product.stock_status === "instock" ? "default" : "destructive"
                }
                className="text-xs"
              >
                {product.stock_status === "instock"
                  ? "Op voorraad"
                  : "Uitverkocht"}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {product.categories?.[0]?.name || "—"}
            </TableCell>
            <TableCell>
              <Link href={`/dashboard/producten/${product.id}`}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Eye className="h-4 w-4" />
                </Button>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
