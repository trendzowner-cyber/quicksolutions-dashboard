// Outscraper Google Maps Reviews — free-tier (500 reviews/mo, no card) third
// party API returning the FULL review list without Google's Business Profile
// approval. Automated fallback while the GBP case is pending.
//
// Envs: OUTSCRAPER_API_KEY + OUTSCRAPER_QUERY (exact Google place_id — most
// reliable; a business name also works but can resolve to the wrong place).
//
// Free-tier facts (learned the hard way, 2026-08-26):
//  - The API is ASYNC: the first call creates a task ("Pending" + id); poll
//    /requests/{id} until "Success". Sync mode (async=false) returns empty.
//  - The task result is read-once: re-polling the same id later returns the
//    place data with reviews_data trimmed. Read on the first "Success".
//  - `reviews` is the TOTAL review count (number — 1508 for Quicksolutions),
//    `reviews_data` is the array of fetched reviews (max 100 per task).
//  - Dates come as "MM/DD/YYYY HH:MM:SS" strings, not ISO.
//  - Billing is per returned review, and the whole batch bills whether or not
//    it is new, so cost is exactly `limit` per poll and cadence × limit is the
//    entire budget. The free tier is 500 reviews/month, reset every 30 days.
//  - Querying by business name can return "__NO_PLACE_FOUND__" — the
//    place_id query is deterministic.

const OUTSCRAPER_BASE = "https://api.app.outscraper.com";

const POLL_ATTEMPTS = 12; // 12 × 2.5s ≈ 30s max — single-place tasks finish in ~10s
const POLL_INTERVAL_MS = 2500;
// Newest 3 per poll, every 6h (OUTSCRAPER_THROTTLE_MS in the sync route) ≈ 360
// of the 500 free reviews/month, worst case 6h before a new review alerts.
// This place gains ~1-2 reviews/day, so a 6h window essentially never holds
// more than 3 — but if one ever did, the reviews past position 3 are lost for
// good: the endpoint returns the newest N by rank, so a review that misses the
// window does not reappear in the next poll.
const REVIEWS_LIMIT = 3;

export function outscraperConfigured(): boolean {
  return !!(process.env.OUTSCRAPER_API_KEY && process.env.OUTSCRAPER_QUERY);
}

export interface OutscraperReview {
  reviewerName: string;
  starRating: number;
  comment: string | null;
  createTime: string | null;
  ownerAnswer: string | null;
  reviewUrl: string | null;
}

export interface OutscraperPlaceData {
  placeId: string | null;
  placeName: string | null;
  rating: number | null;
  reviewCount: number | null;
  website: string | null;
  reviews: OutscraperReview[];
}

export type OutscraperResult =
  | { pending: true; taskId: string }
  | { pending: false; data: OutscraperPlaceData };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiHeaders(): Record<string, string> {
  return { "X-API-KEY": process.env.OUTSCRAPER_API_KEY || "" };
}

async function pollTask(id: string): Promise<Record<string, any> | null> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const res = await fetch(`${OUTSCRAPER_BASE}/requests/${id}`, {
      headers: apiHeaders(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status === "Success") return json;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

// Outscraper dates are "MM/DD/YYYY HH:MM:SS" (UTC) — new Date() misparses the
// format, so build the timestamp manually. Falls back to native parsing.
function parseOutscraperDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    const [, mo, day, y, hh, mi, ss] = m.map(Number);
    const date = new Date(Date.UTC(y, mo - 1, day, hh, mi, ss));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapPlace(place: Record<string, any>): OutscraperPlaceData {
  const raw: Record<string, any>[] = Array.isArray(place.reviews_data)
    ? place.reviews_data
    : Array.isArray(place.reviews)
    ? place.reviews
    : [];
  return {
    placeId: place.place_id ?? null,
    placeName: place.name ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    // `reviews` holds the TOTAL count (number); reviews_data holds this batch.
    reviewCount: typeof place.reviews === "number" ? place.reviews : null,
    website: place.website ?? null,
    reviews: raw
      .map((r) => {
        const rating = Number(r.review_rating);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
        const date = r.review_datetime_utc
          ? parseOutscraperDate(String(r.review_datetime_utc))
          : null;
        return {
          reviewerName: String(r.author_title ?? "Anoniem").slice(0, 120),
          starRating: Math.round(rating),
          comment: r.review_text ? String(r.review_text).slice(0, 5000) : null,
          createTime: date ? date.toISOString() : null,
          ownerAnswer: r.owner_answer ? String(r.owner_answer).slice(0, 5000) : null,
          reviewUrl: r.review_link ? String(r.review_link).slice(0, 500) : null,
        };
      })
      .filter((r): r is OutscraperReview => r !== null),
  };
}

export async function fetchOutscraperReviews(
  query: string,
  reviewsLimit: number = REVIEWS_LIMIT
): Promise<OutscraperResult> {
  const url = new URL(`${OUTSCRAPER_BASE}/maps/reviews-v3`);
  url.searchParams.set("query", query);
  url.searchParams.set("reviewsLimit", String(reviewsLimit));
  url.searchParams.set("sort", "newest"); // default order is rank-based, not date
  url.searchParams.set("region", "be");

  const res = await fetch(url.toString(), { headers: apiHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Outscraper error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();

  if (json.status === "Pending" || json.status === "In Progress") {
    const done = await pollTask(json.id);
    if (!done) return { pending: true, taskId: json.id };
    const place = done?.data?.[0];
    if (!place || place.place_id === "__NO_PLACE_FOUND__") {
      throw new Error("Outscraper: geen resultaat voor deze zoekopdracht");
    }
    return { pending: false, data: mapPlace(place) };
  }

  const place = json?.data?.[0];
  if (!place || place.place_id === "__NO_PLACE_FOUND__") {
    throw new Error("Outscraper: geen resultaat voor deze zoekopdracht");
  }
  return { pending: false, data: mapPlace(place) };
}
