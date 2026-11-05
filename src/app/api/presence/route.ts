import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Presence heartbeat. The dashboard posts here every minute while a tab is
// open; /dashboard/workers reads the timestamp back and shows a green dot only
// for anyone seen in the last three minutes. Nothing is stored historically —
// one column, overwritten, so this cannot grow.
export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db.user.update({
      where: { id: session.userId },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // Best effort — a failed heartbeat must never break the page it runs on.
  }

  return NextResponse.json({ ok: true });
}
