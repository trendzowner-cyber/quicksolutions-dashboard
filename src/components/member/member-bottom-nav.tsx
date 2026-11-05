"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Two things, always visible. Reviews is the job — it comes first and it is
// where the app opens. Instellingen is the drawer: push notifications, account,
// password.

const ITEMS = [
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/instellingen", label: "Instellingen", icon: Settings },
];

export function MemberBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
      // Clears the iPhone home indicator instead of sitting under it.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-2xl items-stretch">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
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
