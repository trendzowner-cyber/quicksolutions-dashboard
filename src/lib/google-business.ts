// Google Business Profile (reviews) — OAuth + API client.
// Scopes: business.manage. Reuses the existing Google Cloud OAuth client.

import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/base-url";

// Dedicated OAuth client for the Business Profile integration (separate
// Google Cloud project — created 2026-08-25). Falls back to the ads client
// for backward compatibility.
const CLIENT_ID = process.env.GOOGLE_GBP_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || "";
const CLIENT_SECRET =
  process.env.GOOGLE_GBP_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || "";
const SCOPE = "https://www.googleapis.com/auth/business.manage";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Shared with the Ads flow rather than derived here independently — see
// `lib/base-url.ts` for why the origin is configuration and not a literal.
const REDIRECT_URI = `${appBaseUrl()}/api/google/callback`;

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<void> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth exchange failed: ${JSON.stringify(data)}`);
  }
  await db.googleToken.upsert({
    where: { scope: SCOPE },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? undefined,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    },
    create: {
      scope: SCOPE,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    },
  });
}

export type GoogleAuthState = "none" | "expired" | "ok";

// A stored token row is NOT proof of a working connection: while the OAuth app
// is in "Testing", Google expires refresh tokens after 7 days. If we treated the
// bare row as "connected", the UI would hide the reconnect button and the
// integration would stay dead forever with no way back. So once Google
// permanently rejects the refresh, drop the row and let the UI offer reconnecting.
async function dropDeadToken(): Promise<void> {
  await db.googleToken.deleteMany({ where: { scope: SCOPE } });
}

/** Resolves the live connection state and, when usable, an access token. */
async function resolveToken(): Promise<{ state: GoogleAuthState; token: string | null }> {
  const rec = await db.googleToken.findUnique({ where: { scope: SCOPE } });
  if (!rec) return { state: "none", token: null };
  if (rec.expiresAt.getTime() > Date.now() + 60_000) {
    return { state: "ok", token: rec.accessToken };
  }
  if (!rec.refreshToken) {
    await dropDeadToken();
    return { state: "expired", token: null };
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: rec.refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    // invalid_grant means revoked or past the 7-day testing expiry — unrecoverable,
    // so clear the row. Anything else (network blip, 5xx) is transient: keep the
    // row and let the next call retry.
    const body = await res.text().catch(() => "");
    if (body.includes("invalid_grant")) await dropDeadToken();
    return { state: "expired", token: null };
  }
  const data = await res.json();
  await db.googleToken.update({
    where: { scope: SCOPE },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    },
  });
  return { state: "ok", token: data.access_token };
}

export async function getGoogleAuthState(): Promise<GoogleAuthState> {
  return (await resolveToken()).state;
}

export async function hasGoogleToken(): Promise<boolean> {
  return (await getGoogleAuthState()) === "ok";
}

async function getValidAccessToken(): Promise<string | null> {
  return (await resolveToken()).token;
}

// Google occasionally 429s brand-new clients — retry with backoff.
async function googleFetch(
  url: string,
  token: string,
  init: RequestInit = {},
  retries = 3
): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (res.status !== 429 && res.status !== 500 && res.status !== 503) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return last!;
}

export interface LocationInfo {
  accountName: string;
  /** Account-qualified parent — `accounts/{account}/locations/{location}`, the
   *  only shape the v4 reviews endpoints accept. See listLocations(). */
  locationName: string;
  title: string;
}

// The v4 reviews API is the legacy endpoint and addresses a location by its
// full `accounts/{account}/locations/{location}` parent. The Business
// Information API that lists our locations returns `locations/{location}`
// alone, so the two cannot be used interchangeably — see listLocations().
const GBP_LOCATION = /^accounts\/[^/]+\/locations\/[^/]+$/;

/**
 * True when `locationName` is a real Business Profile location parent.
 *
 * This is the guard for every write path: rows sourced from Places or
 * Outscraper carry `places/{placeId}`, which belongs to a different API and
 * cannot be replied to through this one. That is also why the id-prefix checks
 * ("outscraper-", "import-", "manual-") are subsumed here — a GBP parent is
 * only ever written together with Google's own review id.
 */
export function isGbpLocation(locationName: string | null | undefined): boolean {
  return !!locationName && GBP_LOCATION.test(locationName);
}

/** Builds a v4 reviews URL, refusing anything that is not a GBP parent.
 *  Without the check a `places/...` parent reaches Google as an unmatched path
 *  and comes back as an HTML 404 page, which reads like a retired endpoint
 *  rather than the malformed URL it is. */
function gbpReviewsUrl(locationName: string, suffix: string): string {
  if (!isGbpLocation(locationName)) {
    throw new Error(
      `Geen Business Profile-locatie: ${locationName ?? "null"} — ` +
        `de reviews-API verwacht accounts/{account}/locations/{location}`
    );
  }
  return `https://mybusiness.googleapis.com/v4/${locationName}${suffix}`;
}

export async function listLocations(): Promise<LocationInfo[] | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const acctRes = await googleFetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20",
    token
  );
  if (!acctRes.ok) throw new Error(`Accounts API error ${acctRes.status}`);
  const acctData = await acctRes.json();

  const locations: LocationInfo[] = [];
  for (const acct of acctData.accounts ?? []) {
    const locRes = await googleFetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title&pageSize=100`,
      token
    );
    if (!locRes.ok) continue;
    const locData = await locRes.json();
    for (const loc of locData.locations ?? []) {
      locations.push({
        accountName: acct.name,
        // The Business Information API returns `locations/{location}` — no
        // account prefix. Everything downstream (listReviews, replyToReview,
        // the stored `locationName` on each review) needs the account-qualified
        // parent, so it is built once, here. Joining these at the call sites
        // instead is what produced `v4/locations/{id}/reviews` and an HTML 404
        // on every sync for as long as the integration existed.
        locationName: `${acct.name}/${loc.name}`,
        title: loc.title ?? "—",
      });
    }
  }
  return locations;
}

export interface GoogleReviewRaw {
  reviewId: string;
  reviewer?: { displayName?: string };
  starRating?: string | number;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

// The v4 reviews API returns starRating as an enum STRING ("ONE" … "FIVE"),
// not a number — Number("FIVE") is NaN, and every NaN that slipped through
// became a 0★ review in the deck.
const STAR_ENUM: Record<string, number> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function parseStarRating(raw: string | number | undefined | null): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return STAR_ENUM[raw] ?? (Number(raw) || 0);
  return 0;
}

export async function listReviews(
  locationName: string,
  maxPages?: number
): Promise<{ reviews: GoogleReviewRaw[]; complete: boolean }> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Geen Google-token");

  const out: GoogleReviewRaw[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const url = gbpReviewsUrl(
      locationName,
      `/reviews?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`
    );
    const res = await googleFetch(url, token);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Reviews API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    for (const r of data.reviews ?? []) {
      out.push({ ...r, starRating: parseStarRating(r.starRating) });
    }
    pages++;
    pageToken = data.nextPageToken ?? undefined;
    // A capped fetch stops early — reviews arrive newest-first, so the cap
    // bounds the window of what is checked, never what is newest.
    if (maxPages && pages >= maxPages) break;
  } while (pageToken);
  // complete = every page was fetched. A capped fetch must never feed the
  // removal snapshot — `seen` would be a partial list and old rows would be
  // judged as removed against it.
  return { reviews: out, complete: !maxPages || pages < maxPages };
}

export async function replyToReview(
  locationName: string,
  reviewId: string,
  comment: string
): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Geen Google-token");
  const res = await googleFetch(
    gbpReviewsUrl(locationName, `/reviews/${reviewId}/reply`),
    token,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }) }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reply API error ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function deleteReviewReply(locationName: string, reviewId: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Geen Google-token");
  const res = await googleFetch(
    gbpReviewsUrl(locationName, `/reviews/${reviewId}/reply`),
    token,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete reply API error ${res.status}: ${text.slice(0, 300)}`);
  }
}
