"use client";

import Link from "next/link";
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
  Sparkles,
  ShoppingCart,
  ListChecks,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: "text-blue-400" },
  { href: "/dashboard/producten", label: "Producten", icon: Package, color: "text-violet-400" },
  { href: "/dashboard/bestellingen", label: "Bestellingen", icon: ShoppingCart, color: "text-emerald-400" },
  { href: "/dashboard/blog", label: "Blog", icon: FileText, color: "text-amber-400" },
  { href: "/dashboard/paginas", label: "Pagina's", icon: File, color: "text-rose-400" },
  { href: "/dashboard/taken", label: "Taken", icon: ListChecks, color: "text-cyan-400" },
  { href: "/dashboard/audit", label: "SEO Audit", icon: SearchCheck, color: "text-orange-400" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-card/50 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 ring-1 ring-violet-500/20">
          <Sparkles className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none tracking-tight">
            QS Beheer
          </p>
          <p className="text-[10px] text-muted-foreground">
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
                    "bg-secondary font-medium shadow-sm",
                  !isActive && "hover:bg-muted/50"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? item.color : "text-muted-foreground"
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
                  <div
                    className={cn(
                      "ml-auto h-1.5 w-1.5 rounded-full",
                      item.color.replace("text", "bg")
                    )}
                  />
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
