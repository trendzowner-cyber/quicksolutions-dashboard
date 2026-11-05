// Places API (New) — display-only fallback that fetches the client's real
// Google rating + latest ~5 reviews while Business Profile API approval is
// pending. Needs GOOGLE_MAPS_API_KEY + GOOGLE_PLACE_ID envs.

const PLACES_BASE = "https://places.googleapis.com/v1";

export function placesConfigured(): boolean {
  return !!(process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_PLACE_ID);
}

async function placesGet(path: string, init: RequestInit = {}) {
  const res = await fetch(`${PLACES_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY || "",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export interface PlacesReviewData {
  // Resource name — places/{placeId}/reviews/{review}. Stable across edits,
  // which the content hash this used to be keyed on is not: rewording a
  // review changed the hash and produced a second row for the same review.
  reviewName: string | null;
  reviewerName: string;
  starRating: number;
  comment: string | null;
  createTime: string | null;
  authorUri: string | null;
  // Opens this exact review in Maps. Turns an alert into something you can
  // act on instead of something you have to go search for.
  reviewUrl: string | null;
}

export interface PlaceRatingData {
  rating: number | null;
  reviewCount: number | null;
}

// Cheap tripwire, safe to run on every sync. The field mask deliberately
// omits `reviews`, which is the field that pushes a Place Details call into
// the expensive Enterprise+Atmosphere SKU. A review arriving — or being
// deleted — moves userRatingCount, so this detects both; fetchPlaceDetails
// only runs once it has.
export async function fetchPlaceRating(placeId: string): Promise<PlaceRatingData> {
  const data = await placesGet(`/places/${placeId}`, {
    headers: { "X-Goog-FieldMask": "rating,userRatingCount" },
  });
  return {
    rating: typeof data.rating === "number" ? data.rating : null,
    reviewCount: typeof data.userRatingCount === "number" ? data.userRatingCount : null,
  };
}

export interface PlaceDetailsData {
  reviews: PlacesReviewData[];
  rating: number | null;
  reviewCount: number | null;
  mapsUri: string | null;
  displayName: string | null;
}

// One-time helper: find the place id for a business name (used to discover
// GOOGLE_PLACE_ID once the API key exists).
export async function findPlaceByName(query: string): Promise<{
  placeId: string;
  displayName: string;
  websiteUri: string | null;
} | null> {
  const data = await placesGet("/places:searchText", {
    method: "POST",
    body: JSON.stringify({ textQuery: query, pageSize: 5 }),
  });
  const place = data.places?.[0];
  return place
    ? {
        placeId: place.id,
        displayName: place.displayName?.text ?? "",
        websiteUri: place.websiteUri ?? null,
      }
    : null;
}

// Full detail including the latest ~5 reviews. Requesting `reviews` is what
// pushes this into the Enterprise+Atmosphere SKU, so it is only worth calling
// once fetchPlaceRating has said something actually changed.
export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsData> {
  const data = await placesGet(`/places/${placeId}`, {
    headers: {
      "X-Goog-FieldMask": "displayName,rating,userRatingCount,googleMapsUri,reviews",
    },
  });
  return {
    reviews: (data.reviews ?? []).map((r: Record<string, any>) => ({
      reviewName: r.name ?? null,
      reviewerName: r.authorAttribution?.displayName ?? "Anoniem",
      starRating: Number(r.rating) || 0,
      comment: r.text?.text ?? null,
      createTime: r.publishTime ?? null,
      authorUri: r.authorAttribution?.uri ?? null,
      reviewUrl: r.googleMapsUri ?? null,
    })),
    rating: typeof data.rating === "number" ? data.rating : null,
    reviewCount: typeof data.userRatingCount === "number" ? data.userRatingCount : null,
    mapsUri: data.googleMapsUri ?? null,
    displayName: data.displayName?.text ?? null,
  };
}
