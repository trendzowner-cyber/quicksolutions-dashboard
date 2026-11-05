# QuickSolutionsPro Control Center — Architecture

## Overview
Single Next.js 16 application (App Router) with:
- **Frontend:** React 19 + shadcn/ui + Radix UI + Tailwind CSS 4 + Recharts
- **Backend:** Next.js API Routes (same process)
- **Database:** PostgreSQL via Prisma ORM (prisma.io hosting)
- **AI:** DeepSeek API (deepseek-chat model)
- **External:** WordPress REST API + WooCommerce REST API (quicksolutionspro.be)

## Directory Structure
```
src/
  app/
    api/                    # All backend API routes
      ai/                   # AI endpoints (blog, SEO, chat, alt-text, etc.)
      ads/                  # Google Ads endpoints
      audit/                # SEO audit endpoint
      auth/                 # login, logout, me
      tasks/                # Task CRUD
      wp/                   # WordPress/WooCommerce proxy endpoints
    dashboard/              # Protected dashboard pages
      audit/                # SEO audit page
      bestellingen/         # Orders list + detail
      blog/                 # Blog list + new + detail
      paginas/              # Pages management
      producten/            # Products list + detail
      taken/                # Task board
    login/                  # Login page
  components/
    auth/                   # LoginForm
    blog/                   # PostsTable, PostEditor, BlogIdeasPanel
    chat/                   # ChatBubble
    dashboard/              # StatsCard, QuickActions, AdsOverview, charts
    layout/                 # Sidebar, MobileNav
    paginas/                # AI page actions
    products/               # AI product actions, filters, table, bulk
    shared/                 # DiffViewer, LoadingButton, Pagination
    ui/                     # shadcn components (button, card, dialog, etc.)
  lib/
    auth.ts                 # JWT session management (jose)
    cache.ts                # In-memory Map cache
    db.ts                   # Prisma client singleton
    deepseek.ts             # DeepSeek API client
    google-ads.ts           # Google Ads API client
    prompts.ts              # AI system prompts (Dutch)
    utils.ts                # cn() utility
    wp-client.ts            # WordPress + WooCommerce API client
  types/
    audit.ts                # AuditIssue, AuditReport
    index.ts                # Re-exports
    seo.ts                  # YoastMeta, SEOMetaInput
    woocommerce.ts          # WCProduct, WCOrder, WCProductCategory
    wordpress.ts            # WPPost, WPPage, YoastHead
prisma/
  schema.prisma             # Database schema
  migrations/               # Migration history
```

## Data Flow
```
Browser → Next.js Server → WordPress/WooCommerce REST API
                          → DeepSeek API
                          → Google Ads API
                          → Prisma → PostgreSQL
```

All WordPress/WooCommerce calls are proxied through Next.js API routes.
Credentials live server-side only (env vars), never exposed to browser.

## Auth Flow
1. User submits password to `/api/auth/login`
2. Server checks against DASHBOARD_PASSWORD or CLIENT_PASSWORD
3. JWT session token created (jose HS256, 7d expiry)
4. Token stored in httpOnly cookie
5. Middleware checks cookie on all `/dashboard/*` routes
6. API routes call verifySession() for authorization

**Current limitation:** Shared passwords, no individual user accounts.

## Caching
- In-memory Map with TTL (60s default)
- Auto-cleanup every 5 minutes
- Capped at 100 entries
- Used for: stats, products list

## Design System
- Light theme (default), dark mode supported via `next-themes`
- shadcn/ui components with custom CSS variables (oklch colors)
- Geist font family
- Dutch (nl_BE) UI language

## Deployment
- **Platform:** Vercel
- **SSO Protection:** Disabled (public access)
- **Custom domain:** Not yet configured
- **Environment:** Production (latest deploy 35d ago)
- **Build:** `next build` → Vercel auto-deploy on git push
