import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { ADS_ACCOUNTS, getAuthUrl } from "@/lib/google-ads";
import { randomBytes } from "crypto";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The account we actually manage. Hardcoding an id here silently connects the
  // wrong account the moment the list changes.
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("ads_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/ads/oauth-callback",
    maxAge: 600,
  });
  const url = getAuthUrl(ADS_ACCOUNTS[0], state);

  return NextResponse.json({ url });
}
