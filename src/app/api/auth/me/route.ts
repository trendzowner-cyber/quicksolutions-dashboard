import { NextResponse } from "next/server";
import { verifySession, getSessionRole } from "@/lib/auth";

export async function GET() {
  const authenticated = await verifySession();
  if (!authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const role = await getSessionRole();
  return NextResponse.json({ authenticated: true, role: role || "admin" });
}
