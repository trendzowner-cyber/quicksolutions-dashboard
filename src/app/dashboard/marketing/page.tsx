"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Link2, Ticket, Plus, Percent, Calendar, Tags, Check } from "lucide-react";

interface WCCoupon {
  id: number;
  code: string;
  discount_type: string;
  amount: string;
  date_expires: string | null;
  usage_count: number;
  usage_limit: number | null;
  minimum_amount: string;
  description: string;
  status: string;
}

const DISCOUNT_LABELS: Record<string, string> = {
  percent: "% Korting",
  fixed_cart: "€ Korting (winkelwagen)",
  fixed_product: "€ Korting (product)",
};

// ═══════════════════════════════════════════
// UTM Builder
// ═══════════════════════════════════════════
function UTMSection() {
  const [baseUrl, setBaseUrl] = useState("https://quicksolutionspro.be");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  function generate() {
    const params = new URLSearchParams();
    if (source.trim()) params.set("utm_source", source.trim());
    if (medium.trim()) params.set("utm_medium", medium.trim());
    if (campaign.trim()) params.set("utm_campaign", campaign.trim());
    if (content.trim()) params.set("utm_content", content.trim());
    if (term.trim()) params.set("utm_term", term.trim());
    const query = params.toString();
    setGeneratedUrl(query ? `${baseUrl}?${query}` : baseUrl);
    setCopied(false);
  }

  async function copyUrl() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    toast.success("URL gekopieerd!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4" /> UTM Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">Basis URL</Label>
          <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">UTM Source *</Label>
            <Input value={source} onChange={e => setSource(e.target.value)} placeholder="facebook" className="h-8 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">UTM Medium *</Label>
            <Input value={medium} onChange={e => setMedium(e.target.value)} placeholder="cpc" className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">UTM Campaign</Label>
            <Input value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="zomer_sale_2026" className="h-8 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">UTM Content</Label>
            <Input value={content} onChange={e => setContent(e.target.value)} placeholder="banner_1" className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">UTM Term</Label>
          <Input value={term} onChange={e => setTerm(e.target.value)} placeholder="kantoorartikelen" className="h-8 text-sm" />
        </div>
        <Button onClick={generate} size="sm" className="gap-1.5">Genereer URL</Button>
        {generatedUrl && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs font-medium text-muted-foreground break-all">{generatedUrl}</p>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copyUrl}>
              {copied ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? "Gekopieerd" : "Kopieer"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════
// Coupon Management
// ═══════════════════════════════════════════
function CouponSection() {
  const [coupons, setCoupons] = useState<WCCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadCoupons() {
    try {
      const res = await fetch("/api/marketing/coupons");
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.coupons || []);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadCoupons(); }, []);

  async function createCoupon() {
    if (!code.trim() || !amount) return;
    setCreating(true);
    try {
      const res = await fetch("/api/marketing/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discount_type: discountType,
          amount: amount,
          description: description.trim(),
          date_expires: expiryDate || null,
          usage_limit: usageLimit ? parseInt(usageLimit) : null,
        }),
      });
      if (!res.ok) { toast.error("Fout bij aanmaken coupon"); return; }
      toast.success(`Coupon ${code.trim().toUpperCase()} aangemaakt!`);
      setShowCreate(false);
      resetForm();
      loadCoupons();
    } catch { toast.error("Verbindingsfout"); }
    finally { setCreating(false); }
  }

  function resetForm() {
    setCode(""); setDiscountType("percent"); setAmount("");
    setDescription(""); setExpiryDate(""); setUsageLimit("");
  }

  if (loading) return <Skeleton className="h-60 rounded-xl" />;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Ticket className="h-4 w-4" /> Coupons ({coupons.length})
        </h3>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3" /> Nieuwe Coupon
        </Button>
      </div>

      {coupons.length > 0 ? (
        <div className="space-y-2">
          {coupons.map((c) => (
            <Card key={c.id} className="border-border">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Percent className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold">{c.code}</span>
                      <Badge variant={c.date_expires && new Date(c.date_expires) < new Date() ? "destructive" : "secondary"} className="text-[9px]">
                        {c.date_expires && new Date(c.date_expires) < new Date() ? "Verlopen" : "Actief"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {DISCOUNT_LABELS[c.discount_type] || c.discount_type} {c.amount}{c.discount_type === "percent" ? "%" : "€"}
                      {c.usage_limit && ` • ${c.usage_count}/${c.usage_limit} gebruikt`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-semibold">{c.usage_count || 0}x</span>
                  <p className="text-[10px] text-muted-foreground">gebruikt</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          <Ticket className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>Geen coupons gevonden</p>
        </div>
      )}

      {/* Create Coupon Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nieuwe Coupon</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Code *</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ZOMER20" className="h-8 text-sm font-mono uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Type</Label>
                <Select value={discountType} onValueChange={(v) => v && setDiscountType(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="fixed_cart">Vast bedrag (wagen)</SelectItem>
                    <SelectItem value="fixed_product">Vast bedrag (product)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Bedrag *</Label>
                <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder={discountType === "percent" ? "20" : "10"} type="number" className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Beschrijving</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Zomer kortingsactie" className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Verloopdatum</Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Gebruikslimiet</Label>
                <Input type="number" value={usageLimit} onChange={e => setUsageLimit(e.target.value)} placeholder="Onbeperkt" className="h-8 text-sm" />
              </div>
            </div>
            <Button className="w-full gap-1.5" onClick={createCoupon} disabled={creating}>
              {creating ? "Aanmaken..." : <><Ticket className="h-4 w-4" /> Coupon Aanmaken</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════
export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marketing</h1>
        <p className="text-muted-foreground text-sm">Campagne tools, UTM builder & coupon beheer</p>
      </div>

      <Tabs defaultValue="utm">
        <TabsList className="h-10">
          <TabsTrigger value="utm" className="gap-2 text-sm"><Link2 className="h-4 w-4" /> UTM Builder</TabsTrigger>
          <TabsTrigger value="coupons" className="gap-2 text-sm"><Ticket className="h-4 w-4" /> Coupons</TabsTrigger>
        </TabsList>

        <TabsContent value="utm" className="mt-4"><UTMSection /></TabsContent>
        <TabsContent value="coupons" className="mt-4"><CouponSection /></TabsContent>
      </Tabs>
    </div>
  );
}
