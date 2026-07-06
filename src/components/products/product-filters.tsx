"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export function ProductFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get("search") || "";
  const [search, setSearch] = useState(currentSearch);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) {
        params.set("search", search);
      } else {
        params.delete("search");
      }
      params.delete("page");
      router.push(`/dashboard/producten?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  function handleClear() {
    setSearch("");
    router.push("/dashboard/producten");
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek producten..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      {currentSearch && (
        <Button variant="ghost" size="sm" onClick={handleClear}>
          <X className="mr-1 h-4 w-4" />
          Wissen
        </Button>
      )}
    </div>
  );
}
