import { NextResponse } from "next/server";
import { getSessionUser, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";

// POST → mark all activity as read for the current user.
export async function POST() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.notificationRead.upsert({
    where: { userId: user.userId },
    create: { userId: user.userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
