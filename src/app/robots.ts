import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/base-url";

// Without this file `/robots.txt` fell through to the middleware and 307'd to
// /login, because the matcher catches everything and robots.txt was not in
// publicPaths. A redirect there is worse than a 404: Google fetches robots.txt
// on every OAuth verification pass to work out what it is allowed to read, and
// being sent to a login page from it says the whole site is behind one — which
// is the same conclusion the reviewer drew about the home page before it was
// made public. A 404 would have been harmless (it means "crawl everything");
// a 307 to /login is not.
//
// The public pages are allowed because the verification has to be able to read
// them. The app is disallowed because it is behind a session anyway and none of
// it should ever surface in a search result.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/voorwaarden"],
        disallow: ["/dashboard", "/api", "/login"],
      },
    ],
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  };
}
