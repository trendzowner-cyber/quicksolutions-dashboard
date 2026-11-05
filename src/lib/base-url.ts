// The public origin this deployment answers on.
//
// Google's OAuth client requires the redirect URI to be byte-identical between
// the authorization request and the token exchange, and it requires the domain
// behind it to be one we can prove we own. `quicksolutions-dashboard.vercel.app`
// is not: `vercel.app` is on the Public Suffix List, so the "top private domain"
// Google asks us to verify in Search Console is that whole hostname — which
// nobody but Vercel can verify. That single fact is what produces "the website
// of your home page URL is not registered to you" on the consent screen, and it
// is why the two OAuth flows below were pinned to a hostname we cannot claim.
//
// So the origin is configuration rather than a literal. Moving to
// dashboard.quicksolutionspro.be is one env var, and — the reason this module
// exists at all — the ads flow and the Business Profile flow cannot drift apart
// while doing it. They were two independent literals before, and a redirect URI
// that disagrees with the one registered in Google Cloud fails the exchange
// with `redirect_uri_mismatch`, after the user has already granted consent.

/**
 * The origin, without a trailing slash. Never empty.
 *
 * Precedence:
 *   1. `APP_BASE_URL` — what we set once the app is on its own domain.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's own answer. This is the
 *      production alias, not the per-deployment URL, which is what a redirect
 *      URI has to be pinned to: a preview hostname would be a different origin
 *      on every push and Google only has the ones we registered.
 *   3. localhost, so `next dev` works with no configuration.
 */
export function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
