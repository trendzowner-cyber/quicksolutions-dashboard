import { NextResponse } from "next/server";
import { getSessionUser, destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (user) {
      await logAudit("logout", user.userId, "user", user.userId);
    }
    await destroySession();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
