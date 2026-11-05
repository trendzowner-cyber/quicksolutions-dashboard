"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

// Three things, always visible. The client should never have to hunt for where
// he is or how to get back — everything else lives behind Meer.
//
// Vandaag and Resultaten are the two halves of the question he actually opens
// the app with: what is happening today, and how is the month going. They sit
// either side of each other on purpose — one is work he hands out, the other is
// the outcome of it — and Meer stays last because it is the drawer, not a
// destination.

const ITEMS = [
  { href: "/dashboard", label: "Vandaag", icon: CalendarDays },
  { href: "/dashboard/resultaten", label: "Resultaten", icon: BarChart3 },
  { href: "/dashboard/meer", label: "Meer", icon: Menu },
];

export function ClientBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
      // Clears the iPhone home indicator instead of sitting under it.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch">
        {ITEMS.map((item) => {
          // "/dashboard" would otherwise light up on every child route.
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors",
                active ? "text-brand" : "text-muted-foreground"
              )}
            >
              <Icon className="h-6 w-6" />
              <span
                className={cn("text-sm font-medium", active && "font-semibold")}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
