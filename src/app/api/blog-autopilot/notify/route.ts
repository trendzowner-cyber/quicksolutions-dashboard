import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { sendTelegram } from "@/lib/telegram";

// Blog autopilot notification: the daily draft-post job runs outside Vercel,
// but the Telegram credentials live only in production env. This small route
// lets the (session-authed) autopilot ask the dashboard to send the message.
export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const title = String(body?.title ?? "").slice(0, 300);
    const adminUrl = String(body?.adminUrl ?? "").slice(0, 500);
    const draftUrl = String(body?.draftUrl ?? "").slice(0, 500);
    if (!title || !adminUrl) {
      return NextResponse.json({ error: "title and adminUrl required" }, { status: 400 });
    }
    const text = [
      "📝 Nieuwe blogpost klaar als concept",
      "",
      title,
      "",
      `✏️ Bewerken: ${adminUrl}`,
      draftUrl ? `🔗 Preview: ${draftUrl}` : "",
      "",
      "Controleer en publiceer wanneer je klaar bent.",
    ]
      .filter(Boolean)
      .join("\n");
    const sent = await sendTelegram(text);
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    return NextResponse.json({ error: "Notify failed", details: String(err) }, { status: 500 });
  }
}
