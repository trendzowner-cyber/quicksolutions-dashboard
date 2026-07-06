import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";

export default function SettingsPage() {
  // Server-side check of env vars
  const hasWP = !!(process.env.WP_USERNAME && process.env.WP_APP_PASSWORD);
  const hasWC = !!(
    process.env.WC_CONSUMER_KEY && process.env.WC_CONSUMER_SECRET
  );
  const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
  const hasAuth = !!(
    process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET
  );

  const checks = [
    { label: "WordPress API", ok: hasWP },
    { label: "WooCommerce API", ok: hasWC },
    { label: "DeepSeek AI", ok: hasDeepSeek },
    { label: "Dashboard Auth", ok: hasAuth },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Instellingen</h1>
        <p className="text-muted-foreground">
          Dashboard configuratie en status
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verbinding Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-center justify-between"
            >
              <span className="text-sm">{check.label}</span>
              {check.ok ? (
                <Badge
                  variant="default"
                  className="bg-emerald-500/10 text-emerald-400 gap-1"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Verbonden
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Niet ingesteld
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Site Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Site Informatie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Website</span>
            <a
              href="https://quicksolutionspro.be"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-1"
            >
              quicksolutionspro.be
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform</span>
            <span>WordPress + WooCommerce</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taal</span>
            <span>Nederlands (nl_BE)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI Provider</span>
            <span>DeepSeek (deepseek-chat)</span>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Password Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wachtwoord Wijzigen</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Het dashboard wachtwoord wordt ingesteld via de{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              DASHBOARD_PASSWORD
            </code>{" "}
            omgevingsvariabele in Vercel.
          </p>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Open Vercel Dashboard
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
