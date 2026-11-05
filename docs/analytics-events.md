# Analytics Event Model

## Event Specification
All events produced by the QSP Analytics Bridge (WordPress plugin + tracking script).

## Core Events
| Event | Description | Key Properties |
|-------|-------------|----------------|
| `page_view` | Page loaded | url, path, title, referrer |
| `page_leave` | User leaves page | duration, scroll_depth |
| `heartbeat` | Active tab signal (10-15s) | timestamp only |
| `product_view` | Product page viewed | product_id, name, price, category |
| `category_view` | Category page viewed | category_id, name |
| `site_search` | Search performed | query, results_count |
| `add_to_cart` | Product added to cart | product_id, variation_id, quantity, price |
| `remove_from_cart` | Product removed | product_id, quantity |
| `view_cart` | Cart page viewed | cart_value, item_count |
| `begin_checkout` | Checkout started | cart_value, item_count |
| `checkout_step` | Checkout step reached | step_name, step_number |
| `purchase` | Order completed | order_id, total, items, coupon_codes |

## Event Properties
```typescript
interface AnalyticsEvent {
  event_id: string;           // UUID
  event_name: string;
  occurred_at: string;        // ISO 8601
  session_id: string;         // UUID
  visitor_id: string;         // Anonymous UUID
  // Page context
  page_url?: string;
  page_path?: string;
  page_title?: string;
  referrer?: string;
  landing_page?: string;
  // Attribution
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  // Device
  device_category?: string;   // desktop, tablet, mobile
  browser?: string;
  os?: string;
  viewport_width?: number;
  // Location (coarse, from server-side IP processing)
  country?: string;
  region?: string;
  city?: string;
  // Commerce
  product_id?: number;
  variation_id?: number;
  category?: string;
  cart_value?: number;
  cart_item_count?: number;
  order_id?: number;
  order_value?: number;
  coupon_codes?: string[];
  // Consent
  consent_state?: string;     // granted, denied, partial
}
```

## Session Definition
- **Active visitor:** Last heartbeat ≤ 60 seconds
- **Session:** Continuous activity, ends after 30 min inactivity
- **Heartbeat:** Every 10-15 seconds while tab visible (reduced when hidden)

## Deduplication
- Events are idempotent (event_id deduplication)
- Purchase events deduplicated by WooCommerce order_id
- Revenue = WooCommerce as authoritative source

## Privacy
- IP addresses processed server-side for geo, then discarded
- Only country/region/city stored
- Consent-aware: no non-essential tracking before consent
- Configurable retention periods
- Deletion capabilities required
