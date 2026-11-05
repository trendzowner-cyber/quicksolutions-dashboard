import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  gradient?: string;
}

const GRADIENTS: Record<string, string> = {
  blue: "from-blue-500/10 via-blue-500/5 to-transparent",
  emerald: "from-emerald-500/10 via-emerald-500/5 to-transparent",
  violet: "from-violet-500/10 via-violet-500/5 to-transparent",
  amber: "from-amber-500/10 via-amber-500/5 to-transparent",
  rose: "from-rose-500/10 via-rose-500/5 to-transparent",
};

const ICON_BG: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  violet: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  amber: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  rose: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  gradient = "blue",
}: StatsCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        "bg-gradient-to-br",
        GRADIENTS[gradient] || GRADIENTS.blue
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {description && (
              <p className="text-[13px] text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl ring-1",
              ICON_BG[gradient] || ICON_BG.blue
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
