"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Globe, Monitor, Clock, MapPin, MousePointerClick,
  ShoppingCart, CreditCard, Eye, Layers, Search,
} from "lucide-react";

interface SessionDetail {
  session: {
    id: string; visitorId: string; startedAt: string; endedAt: string | null;
    deviceType: string | null; browser: string | null; os: string | null;
    country: string | null; region: string | null; city: string | null;
    source: string | null; medium: string | null; campaign: string | null;
    landingPage: string | null; pageViews: number; duration: number | null;
  };
  journey: string[];
  eventCounts: Record<string, number>;
  events: { id: string; eventName: string; occurredAt: string; properties: unknown }[];
  purchase: { orderId: string; total: number; currency: string; occurredAt: string } | null;
}

const EVENT_LABELS: Record<string, string> = {
  page_view: "Pagina bekeken",
  page_leave: "Pagina verlaten",
  heartbeat: "Heartbeat",
  product_view: "Product bekeken",
  add_to_cart: "Toegevoegd aan winkelwagen",
  remove_from_cart: "Verwijderd uit winkelwagen",
  view_cart: "Winkelwagen bekeken",
  begin_checkout: "Checkout gestart",
  add_payment_info: "Betalingsinfo toegevoegd",
  purchase: "Aankoop",
  search: "Gezocht",
  user_identified: "Gebruiker geïdentificeerd",
};

const EVENT_COLORS: Record<string, string> = {
  page_view: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  page_leave: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  heartbeat: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  product_view: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  add_to_cart: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  remove_from_cart: "bg-red-500/10 text-red-400 border-red-500/20",
  view_cart: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  begin_checkout: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  purchase: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  search: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  user_identified: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/analytics/sessions/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  if (!data?.session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg">Sessie niet gevonden</p>
        <Button variant="link" onClick={() => router.back()}>Terug</Button>
      </div>
    );
  }

  const { session, journey, eventCounts, events, purchase } = data;

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatDuration(sec: number | null) {
    if (!sec) return "—";
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  const duration = session.endedAt
    ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
    : session.duration;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Sessie Details</h1>
          <p className="text-xs text-muted-foreground font-mono">{session.id}</p>
        </div>
      </div>

      {/* Session Meta */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetaBadge icon={Globe} label="Land" value={session.country || "Onbekend"} />
        <MetaBadge icon={MapPin} label="Stad" value={session.city || "Onbekend"} />
        <MetaBadge icon={Monitor} label="Apparaat" value={session.deviceType || "Onbekend"} />
        <MetaBadge icon={Clock} label="Duur" value={formatDuration(duration)} />
        <MetaBadge icon={Eye} label="Pages" value={String(session.pageViews)} />
        <MetaBadge icon={Layers} label="Bron" value={session.source || "Direct"} />
      </div>

      {/* Journey Timeline */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MousePointerClick className="h-4 w-4" /> Journey
          </CardTitle>
        </CardHeader>
        <CardContent>
          {journey.length > 0 ? (
            <div className="relative pl-6 border-l-2 border-muted space-y-3">
              {journey.map((page, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-background" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono w-5">{i + 1}</span>
                    <span className="text-sm font-medium">{page}</span>
                    {i === 0 && <Badge variant="secondary" className="text-[9px]">Landing</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Geen pages in deze sessie</p>
          )}
        </CardContent>
      </Card>

      {/* Purchase */}
      {purchase && (
        <Card className="border-emerald-500/20 ring-1 ring-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-400">
              <CreditCard className="h-4 w-4" /> Aankoop
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Order ID</p>
                <p className="text-sm font-mono font-semibold">#{purchase.orderId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Totaal</p>
                <p className="text-sm font-semibold">{purchase.total} {purchase.currency}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tijdstip</p>
                <p className="text-sm font-semibold">{formatTime(purchase.occurredAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event Log */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Search className="h-4 w-4" /> Event Log ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {events.map((evt) => {
              const props = evt.properties as Record<string, unknown> | null;
              return (
                <div key={evt.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                  <Badge className={`text-[10px] border ${EVENT_COLORS[evt.eventName] || "bg-muted"}`}>
                    {EVENT_LABELS[evt.eventName] || evt.eventName}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {formatTime(evt.occurredAt)}
                  </span>
                  <span className="text-xs text-muted-foreground truncate flex-1 text-right">
                    {evt.eventName === "page_view" && props?.page_path
                      ? props.page_path as string
                      : evt.eventName === "add_to_cart" && props?.product_id
                      ? `Product #${props.product_id}`
                      : evt.eventName === "purchase" && props?.order_id
                      ? `Order #${props.order_id}`
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetaBadge({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-3 flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className="text-sm font-medium truncate capitalize">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
