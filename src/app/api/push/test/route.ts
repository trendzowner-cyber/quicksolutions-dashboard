// Send one test push to the caller's own devices — the "does my phone ping?"
// button. Every user can test their own subscription.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { notifyUserPush } from "@/lib/push";

export async function POST() {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sent = await notifyUserPush(session.userId, {
      title: "Testmelding",
      body: "Push werkt op dit toestel",
      url: "/dashboard",
      tag: "qs-test",
    });

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    console.error("Push test error:", error);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
