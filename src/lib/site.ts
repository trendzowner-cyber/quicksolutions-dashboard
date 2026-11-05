// What the product is called, and how to reach the people who run it.
//
// This module exists because Google's fifth complaint was that the app name on
// the consent screen did not match the app name on the home page. A name that
// lives in four files is a name that will disagree with itself, so it lives in
// one, and the manifest, the page titles and the public pages all read it from
// here. The consent screen is the one place that cannot import it — it is typed
// into Google Cloud Console by hand — which is why it is written down:
//
//     Google Cloud Console → OAuth consent screen → App name
//     must be exactly: QuickSolutions Dashboard
//
// The same goes for the two URLs on that screen, which are the routes whose
// titles come from this name:
//
//     Home page:        https://<domain>/
//     Privacy policy:   https://<domain>/privacy

/** Must equal the OAuth consent screen's App name, character for character. */
export const APP_NAME = "QuickSolutions Dashboard";

/**
 * What shows under the icon on a home screen. Shorter than APP_NAME because iOS
 * ellipsises somewhere around a dozen characters — see `app/manifest.ts`.
 */
export const APP_SHORT_NAME = "QuickSolutions";

/** One sentence, used as the meta description and reused on the landing page. */
export const APP_DESCRIPTION =
  "Beheerpaneel voor quicksolutionspro.be: reviews, taken, bestellingen, websitebezoek en advertentieresultaten op één plek.";

export const CONTACT_EMAIL = "kerim@quicksolutionspro.be";

/** The business site the dashboard belongs to. */
export const SITE_URL = "https://quicksolutionspro.be";
