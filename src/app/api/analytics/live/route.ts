import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasPermission } from "@/lib/auth";
import { getLivePresence } from "@/lib/analytics";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "analytics.view")) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const presence = await getLivePresence();
    return NextResponse.json(presence);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get live presence", details: String(error) },
      { status: 500 }
    );
  }
}
