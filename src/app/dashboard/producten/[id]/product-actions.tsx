"use client";

import { AITitleButton } from "@/components/products/ai-title-button";
import { AIDescriptionButton } from "@/components/products/ai-description-button";
import { AISEOButton } from "@/components/products/ai-seo-button";
import { AISocialPost } from "@/components/products/ai-social-post";
import { AIAltText } from "@/components/products/ai-alt-text";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

interface ProductActionsProps {
  productId: number;
  title: string;
  description: string;
  shortDescription: string;
  permalink: string;
  price: string;
  images: Array<{ id: number; src: string; alt: string }>;
}

export function ProductActions({
  productId,
  title,
  description,
  shortDescription,
  permalink,
  price,
  images,
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

      <Separator />

      <AISocialPost
        productName={title}
        price={price}
        description={shortDescription || description}
        permalink={permalink}
      />

      {images.length > 0 && (
        <>
          <Separator />
          <AIAltText
            productId={productId}
            productName={title}
            imageUrl={images[0].src}
            currentAlt={images[0].alt || ""}
            onUpdated={() => router.refresh()}
          />
        </>
      )}
    </div>
  );
}
