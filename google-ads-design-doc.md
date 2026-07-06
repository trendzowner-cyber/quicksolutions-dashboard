# Google Ads API Integration — Design Documentation

## Tool Name
QuickSolutionsPro Analytics Dashboard

## Company
QuickSolutionsPro.be — Refurbished Apple Products, Belgium

## Developer
Azedine — Business Owner

---

## 1. Tool Purpose
An internal analytics dashboard that pulls Google Ads campaign performance data and displays it alongside WooCommerce sales data from quicksolutionspro.be. This gives a unified view of ad spend vs. revenue.

## 2. How the API Will Be Used

### Data Accessed (Read-Only)
- Campaign performance metrics (impressions, clicks, CTR, cost, conversions)
- Ad group and keyword performance
- Conversion tracking data
- Account-level budget and spend summaries

### What We Will NOT Do
- Create, edit, or manage campaigns via API
- Manage bids or budgets via API
- Access or store any user/personal data from ad clicks
- Share data with third parties
- Use the API for any automated advertising

### API Calls
- `GoogleAdsService.Search` — query campaign metrics using GAQL (Google Ads Query Language)
- Estimated frequency: 4-6 requests per hour (dashboard refresh)
- Only the authenticated business owner accesses the dashboard

## 3. Data Flow

```
Google Ads API
    ↓ (OAuth2 authentication — Developer Token)
Next.js Server (Vercel)
    ↓ (proxied API routes, credentials never reach browser)
Browser Dashboard
    ↓ (password-protected admin panel)
Business Owner
```

## 4. Security
- OAuth2 authentication with refresh tokens
- All API calls happen server-side only (Vercel serverless functions)
- API credentials stored in encrypted environment variables
- Dashboard requires password authentication to access
- No user data from ads is stored or logged

## 5. Technology Stack
- Next.js 15 (TypeScript)
- Google Ads API v18
- Hosted on Vercel (EU region)
- Charts rendered with Recharts library

## 6. Contact
- Email: azedine@quicksolutionspro.be
- Website: https://quicksolutionspro.be
- Location: Belgium
