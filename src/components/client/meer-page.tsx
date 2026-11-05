"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronRight,
  ListChecks,
  LogOut,
  Megaphone,
  Moon,
  HeartPulse,
  ShoppingCart,
  Smartphone,
  Star,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isIOS, isStandalone } from "@/components/pwa/install-prompt";

// The catch-all tab. Everything the client occasionally needs and nothing he
// needs every day, as full-width rows he can hit with a thumb.
//
// The five destinations are the existing pages, opened as they are — this is
// progressive disclosure, not a rebuild. He only lands on them from here, so
// they never have to be simplified for him and the operator's versions stay
// exactly as they were.
//
// No account screen, no settings, no role, no profile: nothing behind those
// changes anything he can decide.

const LINKS = [
  { href: "/dashboard/taken", label: "Taken", icon: ListChecks },
  { href: "/dashboard/reviews", label: "Reviews", icon: Star },
  { href: "/dashboard/status", label: "Status website", icon: HeartPulse },
  { href: "/dashboard/marketing", label: "Marketing", icon: Megaphone },
  { href: "/dashboard/bestellingen", label: "Bestellingen", icon: ShoppingCart },
];

function RowShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-14 w-full items-center gap-3 rounded-xl px-3 text-base",
        className
      )}
    >
      {children}
    </div>
  );
}

function RowLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card active:bg-muted/40"
    >
      <RowShell>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 font-medium">{label}</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </RowShell>
    </Link>
  );
}

export function MeerPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // The install row only means something on an iPhone that is not already on
  // the home screen; anywhere else it would be a row that does nothing.
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // Acknowledged, not worked around. Neither of these is derivable during
    // render: next-themes only knows the stored theme on the client, and
    // isIOS/isStandalone read navigator and matchMedia, which the server does
    // not have. Deciding either one while rendering is what produces the
    // hydration mismatch this effect exists to avoid. The linter reports the
    // first setState in the effect; both are the same check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      setCanInstall(isIOS() && !isStandalone());
    } catch {
      // No navigator or no matchMedia — treat it as "cannot install".
    }
  }, []);

  const isDark = theme === "dark";

  const logout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <section className="space-y-2">
        {LINKS.map((link) => (
          <RowLink key={link.href} {...link} />
        ))}
      </section>

      <section className="space-y-2">
        {/* The sidebar's ThemeToggle is a 32px icon button — the right size for
            a mouse, the wrong size for a thumb. Same next-themes state, bigger
            row. */}
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="block w-full rounded-xl border border-border bg-card text-left active:bg-muted/40"
        >
          <RowShell>
            {isDark ? (
              <Sun className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <Moon className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 font-medium">Thema</span>
            <span className="text-muted-foreground">
              {mounted ? (isDark ? "Donker" : "Licht") : ""}
            </span>
          </RowShell>
        </button>

        {canInstall && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("qs:install-help"))}
            className="block w-full rounded-xl border border-border bg-card text-left active:bg-muted/40"
          >
            <RowShell>
              <Smartphone className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="flex-1 font-medium">App op je beginscherm</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </RowShell>
          </button>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="block w-full rounded-xl border border-border bg-card text-left active:bg-muted/40 disabled:opacity-60"
        >
          <RowShell>
            <LogOut className="h-5 w-5 shrink-0 text-rose-400" />
            <span className="flex-1 font-medium text-rose-400">
              {loggingOut ? "Bezig met uitloggen…" : "Uitloggen"}
            </span>
          </RowShell>
        </button>
      </section>
    </div>
  );
}
