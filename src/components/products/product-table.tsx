"use client";

import { useState, useRef, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Package, Check, X } from "lucide-react";
import { toast } from "sonner";

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
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  onProductUpdate?: () => void;
}

function InlineEdit({
  value,
  onSave,
  type = "text",
  options,
}: {
  value: string;
  onSave: (val: string) => Promise<void>;
  type?: "text" | "select";
  options?: { value: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => {
    setVal(value);
  }, [value]);

  async function handleSave() {
    if (val === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(val);
      setEditing(false);
    } catch {
      toast.error("Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setVal(value);
    setEditing(false);
  }

  if (!editing) {
    const display = type === "select" && options
      ? (options.find((o) => o.value === value)?.label ?? value)
      : value;
    return (
      <span
        className="cursor-pointer hover:underline decoration-dotted underline-offset-2"
        onClick={() => setEditing(true)}
        title="Klik om te bewerken"
      >
        {display || "—"}
      </span>
    );
  }

  if (type === "select" && options) {
    return (
      <select
        value={val}
        onChange={(e) => {
          setVal(e.target.value);
          onSave(e.target.value).then(() => setEditing(false));
        }}
        onBlur={() => setEditing(false)}
        className="text-sm bg-muted border border-border rounded px-1 py-0.5"
        autoFocus
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") handleCancel();
        }}
        disabled={saving}
        className="h-7 text-sm w-full max-w-[200px]"
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={handleSave}
      >
        <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={handleCancel}
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </Button>
    </div>
  );
}

export function ProductTable({
  products,
  loading,
  selectedIds,
  onSelectionChange,
  onProductUpdate,
}: ProductTableProps) {
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

  function toggleSelect(id: number) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  function toggleAll() {
    if (selectedIds.length === products.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(products.map((p) => p.id));
    }
  }

  async function updateProduct(id: number, field: string, value: string) {
    const body: Record<string, string> = {};
    body[field] = value;
    const res = await fetch(`/api/wp/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed");
    toast.success(
      field === "name"
        ? "Titel bijgewerkt"
        : field === "price"
        ? "Prijs bijgewerkt"
        : "Status bijgewerkt"
    );
    onProductUpdate?.();
  }

  return (
    <>
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={
                  products.length > 0 &&
                  selectedIds.length === products.length
                }
                onCheckedChange={toggleAll}
              />
            </TableHead>
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
            <TableRow
              key={product.id}
              className={
                selectedIds.includes(product.id) ? "bg-primary/5" : ""
              }
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.includes(product.id)}
                  onCheckedChange={() => toggleSelect(product.id)}
                />
              </TableCell>
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
              <TableCell className="text-sm max-w-[200px]">
                <InlineEdit
                  value={product.name}
                  onSave={(val) => updateProduct(product.id, "name", val)}
                />
              </TableCell>
              <TableCell className="text-sm">
                <InlineEdit
                  value={formatPrice(product.price)}
                  onSave={async (val) => {
                    // Extract numeric value from formatted price
                    const num = val.replace(/[^0-9.,]/g, "").replace(",", ".");
                    await updateProduct(
                      product.id,
                      "regular_price",
                      num
                    );
                  }}
                />
              </TableCell>
              <TableCell>
                <InlineEdit
                  value={product.stock_status}
                  type="select"
                  options={[
                    { value: "instock", label: "Op voorraad" },
                    { value: "outofstock", label: "Uitverkocht" },
                    { value: "onbackorder", label: "In nabestelling" },
                  ]}
                  onSave={(val) =>
                    updateProduct(product.id, "stock_status", val)
                  }
                />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {product.categories?.[0]?.name || "—"}
              </TableCell>
              <TableCell>
                <Link href={`/dashboard/producten/${product.id}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </>
  );
}
