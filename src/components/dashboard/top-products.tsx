"use client";

interface ProductSales {
  name: string;
  count: number;
  revenue: number;
}

interface TopProductsProps {
  products: ProductSales[];
}

export function TopProducts({ products }: TopProductsProps) {
  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Geen productdata beschikbaar
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {products.map((p, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-muted-foreground w-5">
              #{i + 1}
            </span>
            <span className="text-sm truncate">{p.name}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground">{p.count}x</span>
            <span className="text-sm font-medium">
              €{p.revenue.toFixed(0)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
