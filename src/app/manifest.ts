import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from "@/lib/site";

// The manifest is what separates "a bookmark" from "an app on the home screen".
//
// iOS only started reading this in 16.4, so on older iPhones the apple-* tags in
// layout.tsx are what actually does the work — both are needed, and they have to
// agree or the icon and the label disagree with each other. They read the same
// constants for the same reason.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    // What shows under the icon. iOS ellipsises somewhere around a dozen
    // characters, so the long name would be cut off anyway.
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    // Straight into the board, not the marketing root: the icon is a shortcut
    // to the work. An expired session lands on /login from here, which is fine.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "nl",
    dir: "ltr",
    // Both sizes of the same mark: 180 is exactly what iOS wants for the home
    // screen, 512 is what Android and everything else asks for.
    icons: [
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
