import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

// The /api/reviews/*, /api/notify/*, /api/ads/digest and /api/tasks/{sweep,
// briefing} routes are whitelisted here because Supabase pg_cron calls them
// with an X-Sync-Secret header and /api/telegram/webhook because Telegram calls
// it with its own secret header — none of them carry a session cookie. The
// routes themselves enforce auth (see src/lib/cron-auth.ts).
const publicPaths = [
  // The three pages that have to be readable by someone who is not logged in.
  //
  // Google will not approve the OAuth consent screen while the home page and the
  // privacy policy sit behind a login, so these are open by requirement, not by
  // choice. "/" only opens the root: the matcher below is `pathname === p ||
  // pathname.startsWith(p + "/")`, and no path starts with "//".
  "/",
  "/privacy",
  "/voorwaarden",
  // Crawler files. These 307'd to /login before — the matcher catches
  // everything and neither was listed here — and a robots.txt that redirects to
  // a login page tells Google's verifier the entire site is gated, which is
  // exactly the conclusion the branding review is trying to reach about the
  // public pages. See app/robots.ts.
  "/robots.txt",
  "/sitemap.xml",
  "/login",
  // The web app manifest. Not sensitive — a name and two icon paths — and it
  // has to be readable without a session, because the browser and iOS fetch it
  // on their own terms when installing to the home screen. A redirect here is
  // an unparseable manifest, which is a bookmark instead of an app.
  "/manifest.webmanifest",
  "/api/auth/login",
  "/api/analytics/ingest",
  "/api/reviews/sync",
  "/api/reviews/digest",
  "/api/telegram/webhook",
  "/api/notify/uptime",
  "/api/ads/digest",
  "/api/tasks/sweep",
  "/api/tasks/briefing",
];
const staticPaths = ["/_next", "/favicon.ico", ".svg", ".png", ".jpg", ".css", ".js", ".map"];

// Sliding session constants — see the renewal block below.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_SEC = 60 * 60 * 24 * 90;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (staticPaths.some((p) => pathname.includes(p))) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get("session")?.value;

  if (!token) {
    // API routes return 401, pages redirect to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.DASHBOARD_SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // Add user info to request headers for API routes
    const response = pathname.startsWith("/api/")
      ? NextResponse.next({
          request: {
            headers: (() => {
              const requestHeaders = new Headers(request.headers);
              requestHeaders.set("x-user-id", payload.userId as string);
              requestHeaders.set("x-user-role", payload.role as string);
              return requestHeaders;
            })(),
          },
        })
      : NextResponse.next();

    // Sliding session renewal: tokens live 90 days, and every request after the
    // first week mints a fresh one — so anyone who opens the app at least once
    // a month never has to log in again. This runs on every request (including
    // the activity bell's 30s poll), which is exactly why the renewal lives
    // here and not in the layout: Server Components cannot set cookies, and a
    // layout would only ever run on full page loads anyway.
    const issuedAt = typeof payload.time === "number" ? payload.time : 0;
    if (Date.now() - issuedAt > SEVEN_DAYS_MS) {
      const fresh = await new SignJWT({
        userId: payload.userId,
        role: payload.role,
        time: Date.now(),
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("90d")
        .sign(secret);
      response.cookies.set("session", fresh, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: NINETY_DAYS_SEC,
      });
    }

    return response;
  } catch {
    // Token expired or invalid
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    response.cookies.set("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
