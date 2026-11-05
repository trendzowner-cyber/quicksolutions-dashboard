// Web push subscription storage — one row per device per user.
// POST: upsert the caller's subscription. DELETE: remove the caller's own.
// Session-gated by middleware plus the explicit check below (house pattern).

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
}

interface ValidSubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

function validBody(body: SubscribeBody): body is ValidSubscribeBody {
  return (
    typeof body?.endpoint === "string" &&
    body.endpoint.startsWith("https://") &&
    typeof body?.keys?.p256dh === "string" &&
    body.keys.p256dh.length > 0 &&
    typeof body?.keys?.auth === "string" &&
    body.keys.auth.length > 0
  );
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as SubscribeBody;
    if (!validBody(body)) {
      return NextResponse.json({ error: "Ongeldige subscription" }, { status: 400 });
    }

    await db.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        userId: session.userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? null,
      },
      create: {
        userId: session.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
    if (typeof body?.endpoint !== "string") {
      return NextResponse.json({ error: "Ontbrekende endpoint" }, { status: 400 });
    }

    // Scoped to the caller — never delete someone else's device row.
    await db.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: session.userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
