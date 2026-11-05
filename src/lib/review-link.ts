// Public Google Maps links for reviews (pure constants — safe to import from
// both server routes and client components).
//
// business.google.com is owner-only and never deep-links to a single review,
// so team members can't open it. Outscraper's review_link is a direct public
// Google Maps link to the EXACT review — always prefer it. Rows without one
// (GBP-API rows, older CSV imports, manual rows) fall back to the public
// review section of the place listing, which anyone can open.

export const QUICKSOLUTIONS_PLACE_ID = "ChIJ7SzXWedxw0cRNE5n6zAwubs";

// Rows without a stored permalink (brand-new GBP rows — Google's API provides
// NO review links) open the QuickSolutions listing in the Google Maps app.
// The old fallback (search.google.com/local/reviews?placeid=…) now redirects
// to a generic search page on phones, which is how the team landed on a
// Google search box instead of a review. Within ~6h the Outscraper feed
// adopts the exact review link onto these rows, after which this fallback is
// never used for them again.
export const PUBLIC_REVIEWS_FALLBACK = `https://www.google.com/maps/search/?api=1&query_place_id=${QUICKSOLUTIONS_PLACE_ID}&query=Quicksolutions`;

const PUBLIC_LINK_RE =
  /^https:\/\/(www\.|search\.)?google\.[a-z]+(\/maps\/|\/local\/)/i;

// Bare maps/reviews/data= URLs render the review in a passive text view with
// NO report option — the exact complaint from the team. Google's own share
// links carry three params (g_ep, skid, g_st=ic) that together make the page
// render the interactive share-card view where the flag/report button lives.
// Byte-parity with what Google hands out when you share a review, so our
// links behave exactly like the working links the owner tested.
const SHARE_EP =
  "CAISEjI2LjQwLjMuOTg5Mjk1MzUwMBgAINDkASqPASw5NDI5NzY5OSw5NDIzMTE4OCw5NDI4MDU2OCwxMDA4MjE1NTUsNDcwNzE3MDQsOTQyMTg2NDEsOTQyODIxMzQsMTAwODM1Njk0LDEwMDg0MDY0Niw5NDI4Njg2OSwxMDA4MjAyNDcsMTAwODIyNTA0LDEwMDgzODg3NywxMjE4MTY0NjEsMTAwNzk4Nzk3QgJCQQ%3D%3D";

function withReportCard(url: string): string {
  if (!url.includes("google.") || !url.includes("/maps/reviews/data=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}g_ep=${SHARE_EP}&skid=qs-dashboard&g_st=ic`;
}

export function publicReviewLink(url: string | null | undefined): string {
  return url && PUBLIC_LINK_RE.test(url)
    ? withReportCard(url)
    : PUBLIC_REVIEWS_FALLBACK;
}
