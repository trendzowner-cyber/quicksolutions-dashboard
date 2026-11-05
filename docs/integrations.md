# Integrations

## Active Integrations

### WordPress REST API
- **Base URL:** `https://quicksolutionspro.be/wp-json/wp/v2`
- **Auth:** Basic Auth (WP username + Application Password)
- **Used for:** Posts, Pages, Yoast SEO metadata
- **Proxied through:** `/api/wp/*`

### WooCommerce REST API
- **Base URL:** `https://quicksolutionspro.be/wp-json/wc/v3`
- **Auth:** Basic Auth (Consumer Key + Consumer Secret)
- **Used for:** Products, Orders, Categories
- **Proxied through:** `/api/wp/*`

### DeepSeek AI
- **Endpoint:** `https://api.deepseek.com/chat/completions`
- **Model:** deepseek-chat
- **Used for:** Blog generation, SEO optimization, title/description improvement, alt-text, social posts, page redesign

### Google Ads (Partial)
- **Connection:** OAuth 2.0 with refresh token
- **Customer IDs:** 668-709-2345 (Repair) — the Shopping account 480-889-6252 is parked and no longer reported on
- **Manager ID:** 307-370-2998
- **Status:** Campaign overview working, credentials need to be moved to env vars

### Prisma Postgres
- **Host:** db.prisma.io
- **Used for:** Tasks, time tracking, sessions, blog ideas, audit results

## Planned Integrations
- **QSP Analytics Bridge** — WordPress plugin for first-party analytics (Phase 2)
- **GA4** — Google Analytics data import (Phase 6+)
- **Google Search Console** — Search performance data
- **Meta Ads** — Future
- **Email provider** — Future (MailPoet integration?)
- **CRM** — Future

## Connection Status UI
Each integration card should show:
- Connected/Not connected
- Last sync timestamp
- Last error (if any)
- Test connection button
- Disconnect button
- Required permissions/scopes
