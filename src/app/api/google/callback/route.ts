import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { exchangeCode } from "@/lib/google-business";

// Constant-time comparison; both values are 32-char hex, but guard length
// because timingSafeEqual throws on mismatched buffer sizes.
function statesMatch(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state") ?? "";

  // The state cookie is scoped to this exact path, so it only ever rides the
  // OAuth callback — read it once, then always clear it.
  const cookieStore = await cookies();
  const stored = cookieStore.get("google_oauth_state")?.value ?? "";
  cookieStore.delete("google_oauth_state");

  if (error) {
    return NextResponse.redirect(
      new URL("/dashboard/reviews?google=denied", request.url)
    );
  }
  if (!code || !stored || !statesMatch(state, stored)) {
    return NextResponse.redirect(
      new URL("/dashboard/reviews?google=error", request.url)
    );
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(
      new URL("/dashboard/reviews?google=connected", request.url)
    );
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    return NextResponse.redirect(
      new URL("/dashboard/reviews?google=error", request.url)
    );
  }
}
