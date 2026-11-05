"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard,
  Package,
  FileText,
  File,
  SearchCheck,
  LogOut,
  ShoppingCart,
  ListChecks,
  Users,
  Settings,
  Activity,
  Megaphone,
  Lightbulb,
  HeartPulse,
  Star,
  HardHat,
} from "lucide-react";

const baseItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "text-blue-400" },
  { href: "/dashboard/status", label: "Status", icon: HeartPulse, color: "text-teal-400" },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star, color: "text-amber-400" },
  { href: "/dashboard/analytics", label: "Analytics", icon: Activity, color: "text-emerald-400" },
  { href: "/dashboard/insights", label: "Inzichten", icon: Lightbulb, color: "text-yellow-400" },
  { href: "/dashboard/producten", label: "Producten", icon: Package, color: "text-violet-400" },
  { href: "/dashboard/bestellingen", label: "Bestellingen", icon: ShoppingCart, color: "text-emerald-400" },
  { href: "/dashboard/blog", label: "Blog", icon: FileText, color: "text-amber-400" },
  { href: "/dashboard/paginas", label: "Pagina's", icon: File, color: "text-rose-400" },
  { href: "/dashboard/taken", label: "Taken", icon: ListChecks, color: "text-cyan-400" },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone, color: "text-pink-400" },
  { href: "/dashboard/audit", label: "SEO Audit", icon: SearchCheck, color: "text-orange-400" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [showWorkers, setShowWorkers] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        if (!d.user) return;
        setRole(d.user.role);
        setShowWorkers(Boolean(d.user.canViewWorkers));
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isAdmin = role === "owner" || role === "admin";
  // Workers is the client's tracking screen — it sits at the very top for the
  // account that was granted it, and does not exist for anyone else.
  const navItems = [
    ...(showWorkers
      ? [{ href: "/dashboard/workers", label: "Workers", icon: HardHat, color: "text-brand" }]
      : []),
    ...baseItems,
    ...(isAdmin
      ? [
          { href: "/dashboard/team", label: "Team", icon: Users, color: "text-pink-400" },
          { href: "/dashboard/instellingen", label: "Instellingen", icon: Settings, color: "text-gray-400" },
        ]
      : []),
  ];

  return (
    <div className="flex h-full flex-col border-r border-border bg-card/50 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-border">
        <Image
          src="/logo-icon.png"
          alt="QuickSolutions"
          width={36}
          height={36}
          className="h-9 w-9 rounded-lg object-contain"
        />
        <div>
          <p className="text-sm font-semibold leading-none tracking-tight">
            QuickSolutions
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            quicksolutionspro.be
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start gap-2.5 h-9 transition-all duration-150",
                  isActive &&
                    "bg-brand/10 font-medium shadow-sm",
                  !isActive && "hover:bg-muted/50"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-brand" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-sm",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />
                )}
              </Button>
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Bottom */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between px-2">
          <span className="text-xs text-muted-foreground">Thema</span>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-rose-400 transition-colors h-9"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Uitloggen
        </Button>
      </div>
    </div>
  );
}
