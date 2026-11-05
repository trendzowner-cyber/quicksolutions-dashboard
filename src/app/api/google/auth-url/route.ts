import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { buildAuthUrl, hasGoogleToken } from "@/lib/google-business";
import { randomBytes } from "crypto";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/google/callback",
    maxAge: 600,
  });
  return NextResponse.json({
    url: buildAuthUrl(state),
    connected: await hasGoogleToken(),
  });
}
