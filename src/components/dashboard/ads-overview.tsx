"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Eye, MousePointerClick, Target, DollarSign } from "lucide-react";

interface CampaignData {
  campaign: {
    id: string;
    name: string;
    status: string;
    advertisingChannelType: string;
  };
  metrics: {
    impressions?: number;
    clicks?: number;
    costMicros?: number;
    conversions?: number;
    ctr?: number;
    averageCpc?: number;
    conversionsValue?: number;
  };
}

interface AccountData {
  customer: {
    descriptiveName: string;
    id: string;
  };
  metrics: {
    impressions?: number;
    clicks?: number;
    costMicros?: number;
    conversions?: number;
    ctr?: number;
  };
}

export function AdsOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [account, setAccount] = useState<AccountData | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/ads/campaigns");
        if (!res.ok) {
          const data = await res.json();
          setError(data.details || data.error || "Failed to fetch");
          return;
        }
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        setAccount(data.account);
      } catch {
        setError("Failed to connect to Google Ads");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Ads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-base">Google Ads</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error.includes("DEVELOPER_TOKEN") || error.includes("NOT_ACTIVATED")
              ? "Google Ads API toegang is nog in afwachting van goedkeuring. Dit wordt actief zodra de Developer Token is goedgekeurd."
              : error.length > 100
              ? "Kan nog niet verbinden met Google Ads. De Developer Token is nog in review."
              : error}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Ads</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nog geen campagne data beschikbaar.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals
  const total = campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + (c.metrics.impressions || 0),
      clicks: acc.clicks + (c.metrics.clicks || 0),
      cost: acc.cost + (c.metrics.costMicros || 0) / 1_000_000,
      conversions: acc.conversions + (c.metrics.conversions || 0),
      convValue: acc.convValue + (c.metrics.conversionsValue || 0),
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, convValue: 0 }
  );

  const avgCtr =
    total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0;
  const roas = total.cost > 0 ? total.convValue / total.cost : 0;

  return (
    <div className="space-y-4">
      {/* Account name */}
      {account && (
        <p className="text-sm text-muted-foreground">
          {account.customer.descriptiveName} ({account.customer.id})
        </p>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <Eye className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold">
              {(total.impressions / 1000).toFixed(0)}K
            </p>
            <p className="text-xs text-muted-foreground">Impressies</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <MousePointerClick className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold">{total.clicks}</p>
            <p className="text-xs text-muted-foreground">Clicks</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <Target className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold">{avgCtr.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">CTR</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <DollarSign className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold">€{total.cost.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Kosten</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-bold">{roas.toFixed(1)}x</p>
            <p className="text-xs text-muted-foreground">ROAS</p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Campagnes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Campagne</th>
                  <th className="py-2 pr-3 font-medium text-right">Impressies</th>
                  <th className="py-2 pr-3 font-medium text-right">Clicks</th>
                  <th className="py-2 pr-3 font-medium text-right">CTR</th>
                  <th className="py-2 pr-3 font-medium text-right">Kosten</th>
                  <th className="py-2 pr-3 font-medium text-right">Conv.</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr
                    key={c.campaign.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2 pr-3 font-medium truncate max-w-[200px]">
                      {c.campaign.name}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {(c.metrics.impressions || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {c.metrics.clicks || 0}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {((c.metrics.ctr || 0) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-3 text-right">
                      €
                      {((c.metrics.costMicros || 0) / 1_000_000).toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {c.metrics.conversions || 0}
                    </td>
                    <td className="py-2">
                      <Badge
                        variant={
                          c.campaign.status === "ENABLED"
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {c.campaign.status === "ENABLED" ? "Actief" : "Pauze"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
