import { Suspense } from "react";
import { ProductenContent } from "./producten-content";

export default function ProductenPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground p-10">Laden...</div>}>
      <ProductenContent />
    </Suspense>
  );
}
