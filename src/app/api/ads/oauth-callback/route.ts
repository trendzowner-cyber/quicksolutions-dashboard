import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { exchangeCode } from "@/lib/google-ads";
import { db } from "@/lib/db";

// Constant-time comparison; both values are 32-char hex, but guard length
// because timingSafeEqual throws on mismatched buffer sizes.
function statesMatch(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state") ?? "";

  // The state cookie is scoped to this exact path, so it only ever rides the
  // OAuth callback — read it once, then always clear it.
  const cookieStore = await cookies();
  const stored = cookieStore.get("ads_oauth_state")?.value ?? "";
  cookieStore.delete("ads_oauth_state");

  if (error) {
    return NextResponse.json(
      { error: `OAuth error: ${error}`, url: request.nextUrl.toString() },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json({
      error: "No code provided",
      url: request.nextUrl.toString(),
      allParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
    });
  }

  if (!stored || !statesMatch(state, stored)) {
    return NextResponse.redirect(new URL("/dashboard?ads=error", request.url));
  }

  try {
    const tokens = await exchangeCode(code);

    // Store the token in the DB (scope "adwords") so the campaigns route
    // reads it from there — no manual env copy, survives redeploys, and is
    // rotated in place on refresh.
    await db.googleToken.upsert({
      where: { scope: "adwords" },
      create: {
        scope: "adwords",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
          : new Date(Date.now() + 3600 * 1000),
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
          : new Date(Date.now() + 3600 * 1000),
      },
    });

    return NextResponse.redirect(
      new URL("/dashboard?ads=connected", request.url)
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to exchange code", details: String(err) },
      { status: 500 }
    );
  }
}
