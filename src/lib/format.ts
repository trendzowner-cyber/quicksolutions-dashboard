// Shared nl-BE formatters. Never parse locale-formatted strings back to
// numbers — format once, at the edge, from raw numeric values.

const EUR_FULL = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const NUM = new Intl.NumberFormat("nl-BE");
const NUM_2DEC = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 });

/** Full euro amount, e.g. €2.980,68 — always exact, never silently compacted. */
export function eurFull(n: number): string {
  return EUR_FULL.format(n);
}

/** Micros (Google Ads API) → full euro string. */
export function eurMicros(micros: number): string {
  return EUR_FULL.format(micros / 1_000_000);
}

/** Compact for tight KPI cards: €14,0K / €1,2M. Only for KPIs, never tables. */
export function eurCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return "€" + (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 10_000) return "€" + (n / 1_000).toFixed(1).replace(".", ",") + "K";
  return EUR_FULL.format(n);
}

/** Thousands-compact count: 18,8K / 1,7M */
export function numCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 10_000) return (n / 1_000).toFixed(1).replace(".", ",") + "K";
  return NUM.format(Math.round(n * 100) / 100);
}

/** Plain localized number, max 2 decimals (fractional conversions etc.). */
export function num(n: number): string {
  return NUM_2DEC.format(n);
}

export function pct(n: number, decimals = 1): string {
  return (n * 100).toFixed(decimals).replace(".", ",") + "%";
}

/** Short Dutch date: 4 nov */
export function dateShort(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("nl-BE", { day: "numeric", month: "short" });
}

/** Date + time: 4 nov, 16:24 */
export function dateTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("nl-BE", { day: "numeric", month: "short" }) + ", " +
    dt.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
}

/** Relative recency: "zojuist", "3 uur geleden", "gisteren", "2 weken geleden" */
export function timeAgo(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const mins = Math.floor((Date.now() - dt.getTime()) / 60_000);
  if (mins < 2) return "zojuist";
  if (mins < 60) return `${mins} min geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gisteren";
  if (days < 7) return `${days} dagen geleden`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week geleden" : `${weeks} weken geleden`;
  return dateShort(dt);
}
