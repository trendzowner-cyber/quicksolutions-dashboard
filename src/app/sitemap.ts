import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/base-url";

// The three pages that are readable without a session. Listing them gives the
// verification a machine-readable answer to "where is the privacy policy"
// rather than leaving it to be found by following the footer link — and the
// footer link is there too, because a reviewer reads the page, not the sitemap.

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl();
  const lastModified = new Date();

  return [
    { url: `${base}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.9 },
    { url: `${base}/voorwaarden`, lastModified, changeFrequency: "yearly", priority: 0.8 },
  ];
}
