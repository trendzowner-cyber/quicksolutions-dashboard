import { getProduct, getSEOMeta } from "@/lib/wp-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ProductActions } from "./product-actions";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = parseInt(id);

  let product: Record<string, unknown> | null = null;
  let seoMeta: Record<string, unknown> | null = null;

  try {
    const [productRes] = await Promise.all([
      getProduct(productId),
    ]);
    product = productRes.data;

    try {
      seoMeta = await getSEOMeta(productId, "product");
    } catch {
      // SEO meta might not exist
    }
  } catch {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/producten">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Terug naar producten
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Product niet gevonden</p>
        </div>
      </div>
    );
  }

  if (!product) return null;

  const name = (product.name as string) || "Onbekend";
  const price = product.price as string;
  const regularPrice = product.regular_price as string;
  const salePrice = product.sale_price as string;
  const description = (product.description as string) || "";
  const shortDescription = (product.short_description as string) || "";
  const stockStatus = (product.stock_status as string) || "instock";
  const stockQty = product.stock_quantity as number | null;
  const permalink = (product.permalink as string) || "";
  const categories =
    (product.categories as Array<{ id: number; name: string }>) || [];
  const images =
    (product.images as Array<{ id: number; src: string; alt: string }>) || [];

  const seoDescription =
    (seoMeta?._yoast_wpseo_metadesc as string) ||
    (seoMeta?.description as string) ||
    "";
  const seoFocusKw =
    (seoMeta?._yoast_wpseo_focuskw as string) ||
    (seoMeta?.focus_keyword as string) ||
    "";
  const seoTitle =
    (seoMeta?._yoast_wpseo_title as string) ||
    (seoMeta?.title as string) ||
    "";

  function formatPrice(p: string) {
    if (!p || p === "0") return "—";
    return `€${parseFloat(p).toFixed(2).replace(".", ",")}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/producten">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{name}</h1>
            <div className="flex flex-wrap gap-2 mt-1">
              {categories.map((cat) => (
                <Badge key={cat.id} variant="secondary" className="text-xs">
                  {cat.name}
                </Badge>
              ))}
              <Badge
                variant={
                  stockStatus === "instock" ? "default" : "destructive"
                }
                className="text-xs"
              >
                {stockStatus === "instock" ? "Op voorraad" : "Uitverkocht"}
              </Badge>
            </div>
          </div>
        </div>
        {permalink && (
          <a href={permalink} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Bekijk op site
            </Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Product Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Image */}
          {images[0] && (
            <div className="aspect-video rounded-xl overflow-hidden bg-muted">
              <img
                src={images[0].src}
                alt={images[0].alt || name}
                className="h-full w-full object-contain"
              />
            </div>
          )}

          {/* Price */}
          <div>
            <p className="text-sm text-muted-foreground">Prijs</p>
            <div className="flex items-center gap-2 mt-1">
              {salePrice && salePrice !== regularPrice ? (
                <>
                  <p className="text-2xl font-bold text-emerald-400">
                    {formatPrice(salePrice)}
                  </p>
                  <p className="text-lg text-muted-foreground line-through">
                    {formatPrice(regularPrice)}
                  </p>
                </>
              ) : (
                <p className="text-2xl font-bold">
                  {formatPrice(price || regularPrice)}
                </p>
              )}
            </div>
            {stockQty !== null && stockQty !== undefined && (
              <p className="text-sm text-muted-foreground mt-1">
                {stockQty} stuks op voorraad
              </p>
            )}
          </div>

          <Separator />

          {/* Short Description */}
          {shortDescription ? (
            <div>
              <p className="text-sm font-medium mb-2">Korte Beschrijving</p>
              <div
                className="prose prose-sm prose-invert max-w-none text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: shortDescription }}
              />
            </div>
          ) : null}

          {/* Full Description */}
          <div>
            <p className="text-sm font-medium mb-2">Beschrijving</p>
            {description ? (
              <div
                className="prose prose-sm prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Geen beschrijving beschikbaar
              </p>
            )}
          </div>

          <Separator />

          {/* Current SEO Meta */}
          <div>
            <p className="text-sm font-medium mb-2">Huidige SEO Meta</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  SEO Titel
                </p>
                <p className="text-sm">{seoTitle || "(niet ingesteld)"}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  Meta Beschrijving
                </p>
                <p className="text-sm">{seoDescription || "(niet ingesteld)"}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">
                  Focus Keyphrase
                </p>
                <p className="text-sm">{seoFocusKw || "(niet ingesteld)"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: AI Actions */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <p className="text-sm font-semibold">AI Acties</p>
            <ProductActions
              productId={productId}
              title={name}
              description={description}
              shortDescription={shortDescription}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
