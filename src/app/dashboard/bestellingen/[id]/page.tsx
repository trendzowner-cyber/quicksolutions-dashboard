import { getProduct } from "@/lib/wp-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const WC_API_URL = "https://quicksolutionspro.be/wp-json/wc/v3";

function wcAuth(): string {
  return Buffer.from(
    `${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`
  ).toString("base64");
}

const STATUS_MAP: Record<string, string> = {
  completed: "Voltooid",
  processing: "In behandeling",
  pending: "In afwachting",
  "on-hold": "In wacht",
  cancelled: "Geannuleerd",
  refunded: "Terugbetaald",
  failed: "Mislukt",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let order: Record<string, unknown> | null = null;

  try {
    const res = await fetch(`${WC_API_URL}/orders/${id}`, {
      headers: { Authorization: `Basic ${wcAuth()}` },
    });
    if (!res.ok) throw new Error("Failed");
    order = await res.json();
  } catch {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/bestellingen">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Terug naar bestellingen
          </Button>
        </Link>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Bestelling niet gevonden</p>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const billing = order.billing as Record<string, string> | undefined;
  const shipping = order.shipping as Record<string, string> | undefined;
  const items = (order.line_items as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/bestellingen">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">
            {order.number as string}
          </h1>
          <Badge className="text-xs mt-1">
            {STATUS_MAP[order.status as string] || (order.status as string)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Producten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{item.name as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity as number}x €
                      {parseFloat(item.price as string || "0").toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    €{parseFloat(item.total as string || "0").toFixed(2).replace(".", ",")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-48 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotaal</span>
                <span>
                  €
                  {parseFloat(
                    (order.total as string) || "0"
                  ).toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Verzending</span>
                <span>
                  €
                  {parseFloat(
                    (order.shipping_total as string) || "0"
                  ).toFixed(2).replace(".", ",")}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Totaal</span>
                <span>
                  €
                  {parseFloat(
                    (order.total as string) || "0"
                  ).toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Customer info */}
        <div className="space-y-4">
          {billing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Factuuradres</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>
                  {billing.first_name} {billing.last_name}
                </p>
                {billing.company && <p>{billing.company}</p>}
                <p>{billing.address_1}</p>
                {billing.address_2 && <p>{billing.address_2}</p>}
                <p>
                  {billing.postcode} {billing.city}
                </p>
                <p>{billing.country}</p>
                {billing.email && (
                  <p className="text-muted-foreground">{billing.email}</p>
                )}
                {billing.phone && (
                  <p className="text-muted-foreground">{billing.phone}</p>
                )}
              </CardContent>
            </Card>
          )}

          {shipping && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Verzendadres</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>
                  {shipping.first_name} {shipping.last_name}
                </p>
                <p>{shipping.address_1}</p>
                <p>
                  {shipping.postcode} {shipping.city}
                </p>
                <p>{shipping.country}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Betaalmethode</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="capitalize">
                {(order.payment_method_title as string) ||
                  (order.payment_method as string) ||
                  "Onbekend"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
