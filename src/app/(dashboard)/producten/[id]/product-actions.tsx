"use client";

import { AITitleButton } from "@/components/products/ai-title-button";
import { AIDescriptionButton } from "@/components/products/ai-description-button";
import { AISEOButton } from "@/components/products/ai-seo-button";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

interface ProductActionsProps {
  productId: number;
  title: string;
  description: string;
  shortDescription: string;
}

export function ProductActions({
  productId,
  title,
  description,
  shortDescription,
}: ProductActionsProps) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <AITitleButton
        productId={productId}
        currentTitle={title}
        description={shortDescription || description}
        onUpdated={() => router.refresh()}
      />

      <Separator />

      <AIDescriptionButton
        productId={productId}
        currentDescription={description}
        shortDescription={shortDescription}
        title={title}
        onUpdated={() => router.refresh()}
      />

      <Separator />

      <AISEOButton
        productId={productId}
        title={title}
        description={shortDescription || description}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
