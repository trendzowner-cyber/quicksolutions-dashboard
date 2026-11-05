# QuickSolutionsPro Control Center — UI source for review

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui primitives · lucide-react icons · Poppins font
**Live:** https://quicksolutions-dashboard.vercel.app
**Language:** all dashboard copy is Dutch (the client is Flemish). No emoji in the UI by rule.

## Who uses it

- **Owner (me):** full access, 14 pages, does all the actual work.
- **Client (CEO, role `viewer`):** wants ONE thing — to open his phone and see whether the work
  he pays for got done today. He says the current UI is *"too difficult and too hard on the eye"*.

## The problem to solve

The `viewer` currently gets the **exact same shell and the same 12-item sidebar** as the owner,
just with a couple of items hidden. Every page is built for an operator: dense tables, filters,
toolbars, 12 nav items, small text, muted greys.

**Goal: a separate, drastically simplified view that ONLY the `viewer` role sees.** Plain language,
big type, one obvious answer per screen ("did it get done today?"), no dense tables, no filters,
no jargon. The owner's own view must stay exactly as it is.

## What is in this file, and why

1. `globals.css` — the design system. Every colour, radius and font lives here as a CSS variable.
   This is the single highest-leverage file for "hard on the eye": it is light-theme-first with a
   dark override, and the greys (`--muted-foreground`) are low-contrast.
2. Root + dashboard layouts — the app shell.
3. Sidebar + mobile nav — the 12-item navigation the client finds overwhelming.
4. The dashboard home page and the Workers board — the screens built specifically for the client.

## Constraints for any redesign advice

- Tailwind v4 with `@theme inline` tokens — propose changes as token values or utility classes,
  not as a new CSS framework.
- Keep the existing shadcn/ui primitives (`src/components/ui/*`) unless there is a strong reason.
- Dark mode must keep working; the client's phone is usually in dark mode.
- Mobile-first: the client is on an iPhone.

---

## `src/app/globals.css`

```tsx
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-poppins);
  --font-mono: var(--font-poppins);
  --font-heading: var(--font-poppins);
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --brand: oklch(0.66 0.212 34);
  --brand-foreground: oklch(0.985 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --brand: oklch(0.74 0.18 38);
  --brand-foreground: oklch(0.15 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}```

## `src/app/layout.tsx`

```tsx
import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Icons come from the app-dir file conventions: favicon.ico (multi-size,
// built from the logo) + icon.png (512) + apple-icon.png (180).
export const metadata: Metadata = {
  title: "QuickSolutionsPro — Control Center",
  description: "AI-aangedreven beheerpaneel voor quicksolutionspro.be",
  // Home-screen behaviour on iOS. Without `capable`, "Zet op beginscherm" makes
  // a bookmark that reopens in Safari with the address bar — which is the one
  // thing that stops it feeling like an app.
  appleWebApp: {
    capable: true,
    // Shorter than the page title, which iOS would otherwise use and truncate.
    title: "QuickSolutions",
    // An opaque black status bar rather than black-translucent: the translucent
    // one slides the content under the clock, and on a phone that eats the
    // header. This matches the dark UI without any safe-area gymnastics.
    statusBarStyle: "black",
  },
  // iOS turns anything that looks like a phone number into a blue call link,
  // which mangles order numbers and prices on the board.
  formatDetection: { telephone: false },
  other: {
    // Next emits the standard `mobile-web-app-capable` from the flag above but
    // not this older spelling, which is the one iOS reads before 16.4 — and on
    // those phones it is the difference between an app and a Safari bookmark.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available — pinching into a dense table is a legitimate thing to
  // want, and blocking it is an accessibility problem.
  maximumScale: 5,
  // Tints the status/address bar to match, mostly for Android.
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nl"
      className={`${poppins.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider delay={300}>
            {children}
          </TooltipProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--card)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

## `src/app/dashboard/layout.tsx`

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { ActivityBell } from "@/components/activity/activity-bell";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const authenticated = token ? await verifySession(token) : false;

  if (!authenticated) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Marks this user as online for the Workers view. */}
      <PresenceHeartbeat />

      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-col">
        <Sidebar />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav />
        {/* Desktop top bar — notification bell */}
        <header className="hidden lg:flex h-12 shrink-0 items-center justify-end gap-2 border-b border-border px-4 md:px-6">
          <ActivityBell mode="desktop" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
        <ChatBubble />
      </div>
    </div>
  );
}
```

## `src/components/layout/sidebar.tsx`

```tsx
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
```

## `src/components/layout/mobile-nav.tsx`

```tsx
"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { ActivityBell } from "@/components/activity/activity-bell";
import { useState } from "react";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-14 items-center gap-2 px-4 border-b border-border lg:hidden">
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">Navigatie</SheetTitle>
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="flex items-center gap-2">
        <Image src="/logo-icon.png" alt="QuickSolutions" width={24} height={24} className="h-5 w-5 object-contain" />
        <span className="text-sm font-semibold">QuickSolutions</span>
      </div>

      <div className="ml-auto">
        <ActivityBell mode="mobile" />
      </div>
    </div>
  );
}
```

## `src/app/dashboard/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { AdsOverview } from "@/components/dashboard/ads-overview";
import { DashboardCharts } from "./dashboard-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, FileText, ShoppingCart, TrendingUp } from "lucide-react";
import type { WCOrder } from "@/types/woocommerce";

export default function DashboardHome() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ productCount: 0, postCount: 0, orderCount: 0 });
  const [orders, setOrders] = useState<WCOrder[]>([]);
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, ordersRes] = await Promise.all([
          fetch("/api/wp/stats").then((r) => r.json()),
          fetch("/api/wp/orders?per_page=50&orderby=date&order=desc").then((r) => r.json()),
        ]);
        setStats(statsRes);
        const ords = (ordersRes.data || []).map((o: Record<string, unknown>) => ({
          id: o.id as number, number: o.number as string, status: o.status as string,
          date_created: o.date_created as string, total: (parseFloat(o.total as string) || 0).toFixed(2),
          currency: (o.currency as string) || "EUR",
          billing: (o.billing || {}) as WCOrder["billing"],
          line_items: (o.line_items || []) as WCOrder["line_items"],
        })) as WCOrder[];
        setOrders(ords);
        setRevenue(
          ords.filter((o: WCOrder) => o.status === "completed" || o.status === "processing")
            .reduce((s: number, o: WCOrder) => s + parseFloat(o.total), 0)
        );
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold tracking-tight">Dashboard</h1></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-[250px] w-full rounded-lg" /></div>
          <div className="rounded-xl border border-border bg-card p-6 space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-[250px] w-full rounded-lg" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overzicht van quicksolutionspro.be</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Producten" value={stats.productCount} icon={Package} gradient="blue" description="WooCommerce catalogus" />
        <StatsCard title="Blog Posts" value={stats.postCount} icon={FileText} gradient="violet" description="Gepubliceerde artikels" />
        <StatsCard title="Bestellingen" value={stats.orderCount} icon={ShoppingCart} gradient="emerald" description="Totaal aantal orders" />
        <StatsCard title="Totale Omzet" value={revenue > 0 ? `€${revenue.toFixed(0)}` : "—"} icon={TrendingUp} gradient="amber" description="Voltooide orders" />
      </div>

      <DashboardCharts orders={orders} />
      <AdsOverview />
      <div><h2 className="text-lg font-semibold mb-3">Snelle Acties</h2><QuickActions /></div>
    </div>
  );
}
```

## `src/app/dashboard/dashboard-data.tsx`

```tsx
import { getStats, getOrders } from "@/lib/wp-client";
import type { WCOrder } from "@/types/woocommerce";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DashboardCharts } from "./dashboard-charts";
import { Package, FileText, ShoppingCart, TrendingUp } from "lucide-react";

export async function DashboardData() {
  let stats = { productCount: 0, postCount: 0, orderCount: 0 };
  let orders: WCOrder[] = [];

  try {
    const [statsResult, orderRes] = await Promise.all([
      getStats(),
      getOrders({ per_page: "50", orderby: "date", order: "desc" }),
    ]);
    stats = statsResult;
    orders = orderRes.data.map((o) => ({
      id: o.id as number, number: o.number as string, status: o.status as string,
      date_created: o.date_created as string, total: (parseFloat(o.total as string) || 0).toFixed(2),
      currency: (o.currency as string) || "EUR",
      billing: (o.billing || {}) as WCOrder["billing"],
      line_items: (o.line_items || []) as WCOrder["line_items"],
    })) as WCOrder[];
  } catch {}

  const revenue = orders
    .filter((o) => o.status === "completed" || o.status === "processing")
    .reduce((s, o) => s + parseFloat(o.total), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overzicht van quicksolutionspro.be</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Producten" value={stats.productCount} icon={Package} gradient="blue" description="WooCommerce catalogus" />
        <StatsCard title="Blog Posts" value={stats.postCount} icon={FileText} gradient="violet" description="Gepubliceerde artikels" />
        <StatsCard title="Bestellingen" value={stats.orderCount} icon={ShoppingCart} gradient="emerald" description="Totaal aantal orders" />
        <StatsCard title="Totale Omzet" value={revenue > 0 ? `€${revenue.toFixed(0)}` : "—"} icon={TrendingUp} gradient="amber" description="Voltooide orders" />
      </div>

      <DashboardCharts orders={orders} />
    </div>
  );
}
```

## `src/app/dashboard/dashboard-charts.tsx`

```tsx
"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { OrderStatusChart } from "@/components/dashboard/order-status-chart";
import { TopProducts } from "@/components/dashboard/top-products";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import type { WCOrder } from "@/types/woocommerce";

interface DashboardChartsProps {
  orders: WCOrder[];
}

export function DashboardCharts({
  orders,
}: DashboardChartsProps) {
  const productSales = useMemo(() => {
    const sales: Record<string, { name: string; count: number; revenue: number }> = {};
    orders
      .filter((o) => o.status === "completed" || o.status === "processing")
      .forEach((o) => {
        o.line_items?.forEach((item) => {
          const key = item.product_id?.toString() || item.name;
          if (!sales[key]) {
            sales[key] = { name: item.name, count: 0, revenue: 0 };
          }
          sales[key].count += item.quantity;
          sales[key].revenue += parseFloat(item.total) || 0;
        });
      });

    return Object.values(sales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [orders]);

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          <p>Nog geen ordergegevens beschikbaar.</p>
          <p className="text-sm mt-1">
            Charts verschijnen zodra er orders binnenkomen.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Omzet (6m)</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart orders={orders} />
        </CardContent>
      </Card>

      {/* Order status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Status</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusChart orders={orders} />
        </CardContent>
      </Card>

      {/* Top products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Producten</CardTitle>
        </CardHeader>
        <CardContent>
          <TopProducts products={productSales} />
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recente Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentOrders
            orders={orders.slice(0, 5).map((o) => ({
              id: o.id,
              number: o.number,
              customer:
                o.billing?.first_name || o.billing?.last_name
                  ? `${o.billing.first_name} ${o.billing.last_name}`
                  : "Gast",
              date: o.date_created,
              status: o.status,
              total: parseFloat(o.total || "0").toFixed(2),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

## `src/components/workers/workers-board.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  Repeat,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RecurringDialog } from "@/components/taken/recurring-dialog";
import { AssignTaskDialog } from "./assign-task-dialog";
import type { TaskUser } from "@/lib/tasks";

// The client-facing board: one card per worker, nothing to click except the
// links that matter. Phone first — Azedine opens this standing in a shop, so
// the answer ("did he do it today") has to be readable without scrolling or
// zooming.

type RecurringState = "done" | "late" | "missed" | "pending";

interface WorkerRecurringItem {
  id: string;
  title: string;
  deadline: string;
  /** End-of-day cut-off ("18:00") when the obligation has one, else null. */
  lateUntil: string | null;
  state: RecurringState;
  stateText: string;
  link: string | null;
  linkLabel: string | null;
}

interface WorkerDay {
  date: string;
  label: string;
  isToday: boolean;
  done: number;
  total: number;
  outcome: "done" | "partial" | "missed" | "none" | "future";
}

interface WorkerOpenTask {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  priority: string;
  /** A deadline in words, or the age when there is no deadline at all. */
  dueText: string;
  overdue: boolean;
  dueToday: boolean;
  hasDue: boolean;
  createdAt: string;
}

interface WorkerSummary {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  online: boolean;
  lastSeenText: string;
  todayDone: number;
  todayTotal: number;
  openTasks: number;
  openTaskList: WorkerOpenTask[];
  recurring: WorkerRecurringItem[];
  history: WorkerDay[];
}

interface WorkersBoardData {
  date: string;
  dateLabel: string;
  generatedAt: string;
  workers: WorkerSummary[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  marketer: "Marketeer",
  content_manager: "Content Manager",
  sales: "Sales",
  analyst: "Analist",
  viewer: "Viewer",
};

const STATE_STYLE: Record<
  RecurringState,
  { icon: typeof CheckCircle2; className: string; ring: string }
> = {
  done: {
    icon: CheckCircle2,
    className: "text-emerald-400",
    ring: "bg-emerald-500/10 ring-emerald-500/20",
  },
  pending: {
    icon: Clock,
    className: "text-amber-400",
    ring: "bg-amber-500/10 ring-amber-500/20",
  },
  late: {
    icon: Clock,
    className: "text-amber-400",
    ring: "bg-amber-500/10 ring-amber-500/20",
  },
  missed: {
    icon: AlertTriangle,
    className: "text-rose-400",
    ring: "bg-rose-500/10 ring-rose-500/20",
  },
};

/** A dot, not a badge — priority matters here only as a glance-ordering. */
const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400/60",
  normal: "bg-blue-400",
  high: "bg-amber-400",
  urgent: "bg-red-400",
};

const BAR_STYLE: Record<WorkerDay["outcome"], string> = {
  done: "bg-emerald-500/80",
  partial: "bg-amber-500/80",
  missed: "bg-rose-500/70",
  none: "bg-muted",
  future: "bg-muted",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function updatedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "zojuist bijgewerkt";
  return `${mins} min geleden bijgewerkt`;
}

function WorkerCard({
  worker,
  onRequestTask,
}: {
  worker: WorkerSummary;
  onRequestTask: (worker: WorkerSummary) => void;
}) {
  const percent =
    worker.todayTotal > 0
      ? Math.round((worker.todayDone / worker.todayTotal) * 100)
      : 0;
  const allDone = worker.todayTotal > 0 && worker.todayDone === worker.todayTotal;

  return (
    <Card className="gap-3 p-4">
      {/* Identity + presence */}
      <div className="flex items-center gap-3">
        {worker.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={worker.avatarUrl}
            alt={worker.name}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
            {initials(worker.name) || <UserRound className="h-5 w-5" />}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{worker.name}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[worker.role] ?? worker.role}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              worker.online ? "bg-emerald-400" : "bg-muted-foreground/40"
            )}
          />
          <span
            className={cn(
              "text-xs",
              worker.online ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {worker.online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Today at a glance */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Vandaag</span>
          <span
            className={cn(
              "text-xs font-medium",
              allDone ? "text-emerald-400" : "text-foreground"
            )}
          >
            {worker.todayTotal > 0
              ? `${worker.todayDone} van ${worker.todayTotal} klaar`
              : worker.openTasks > 0
                ? `${worker.openTasks} open`
                : "Geen taken vandaag"}
          </span>
        </div>
        {worker.todayTotal > 0 && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                allDone ? "bg-emerald-500" : "bg-brand"
              )}
              style={{ width: `${Math.max(percent, 3)}%` }}
            />
          </div>
        )}
      </div>

      {/* Today's obligations */}
      {worker.recurring.length > 0 && (
        <div className="space-y-2">
          {worker.recurring.map((item) => {
            const style = STATE_STYLE[item.state];
            const Icon = style.icon;
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-lg p-3 ring-1 ring-inset",
                  style.ring
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    <p className={cn("text-xs", style.className)}>{item.stateText}</p>
                  </div>
                </div>

                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {item.linkLabel ?? "Bekijk resultaat"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* What he is actually working on, not just how much. These are the same
          Task rows the Taken board edits — one table, so ticking a task there
          is reflected here on the next refresh. */}
      {worker.openTaskList.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">
            Op het bord
            {worker.openTasks > worker.openTaskList.length &&
              ` (${worker.openTaskList.length} van ${worker.openTasks})`}
          </p>
          <div className="space-y-0.5">
            {worker.openTaskList.map((task) => (
              <a
                key={task.id}
                href={`/dashboard/taken?task=${task.id}`}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    PRIORITY_DOT[task.priority] ?? "bg-muted-foreground/40"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium leading-snug">
                    {task.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {task.statusLabel} ·{" "}
                    <span
                      className={cn(
                        task.overdue && "font-medium text-rose-400",
                        task.dueToday && "font-medium text-amber-400"
                      )}
                    >
                      {task.dueText}
                    </span>
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Last seven days — the pattern is what the client is really buying */}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Laatste 7 dagen</p>
        <div className="flex items-end gap-1.5">
          {worker.history.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  "h-8 w-full rounded-md",
                  BAR_STYLE[day.outcome],
                  day.isToday && "ring-1 ring-foreground/30"
                )}
                title={`${day.label}: ${day.done}/${day.total}`}
              />
              <span
                className={cn(
                  "text-[10px] leading-none",
                  day.isToday ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {day.label.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Handing over work without leaving this screen — the client's own way
          in, and the shortest path for Kerim too. */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 text-xs text-muted-foreground"
        onClick={() => onRequestTask(worker)}
      >
        <Plus className="h-3.5 w-3.5" />
        Taak voor {worker.name.split(" ")[0]}
      </Button>
    </Card>
  );
}

export function WorkersBoard({
  initial,
  canManage,
}: {
  initial: WorkersBoardData;
  /** owner/admin: may edit the recurring rules everyone is measured against. */
  canManage: boolean;
}) {
  const [data, setData] = useState<WorkersBoardData>(initial);
  const [busy, setBusy] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [requestWorker, setRequestWorker] = useState<WorkerSummary | null>(null);

  // Only needed when the dialog opens, and only for the managers who can.
  const openRecurring = useCallback(async () => {
    if (!users.length) {
      try {
        const res = await fetch("/api/users?scope=assignable", { cache: "no-store" });
        if (res.ok) setUsers(((await res.json()) as { users?: TaskUser[] }).users ?? []);
      } catch {
        // the dialog still opens; the assignee picker just stays empty
      }
    }
    setRecurringOpen(true);
  }, [users.length]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/workers", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as WorkersBoardData);
    } catch {
      // Keep showing the last good board rather than an empty screen.
    } finally {
      setBusy(false);
    }
  }, []);

  // Presence and task completion both move on their own — keep the board
  // honest without making the client pull to refresh.
  useEffect(() => {
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Workers</h1>
          <p className="text-xs text-muted-foreground capitalize">{data.dateLabel}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={refresh}
          disabled={busy}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          {updatedAgo(data.generatedAt)}
        </Button>
      </div>

      {/* The board Kerim is judged on is also the place he should be able to
          change the rules — otherwise "add a daily" means finding another page. */}
      {canManage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={openRecurring}
        >
          <Repeat className="h-3.5 w-3.5" />
          Dagelijkse taken beheren
        </Button>
      )}

      {data.workers.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nog geen workers met taken.
        </Card>
      ) : (
        data.workers.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} onRequestTask={setRequestWorker} />
        ))
      )}

      {canManage && (
        <RecurringDialog
          open={recurringOpen}
          onOpenChange={setRecurringOpen}
          users={users}
        />
      )}

      <AssignTaskDialog
        open={requestWorker !== null}
        onOpenChange={(open) => {
          if (!open) setRequestWorker(null);
        }}
        worker={requestWorker}
        onCreated={refresh}
      />
    </div>
  );
}
```
