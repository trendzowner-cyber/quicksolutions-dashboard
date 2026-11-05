import { NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";

// Owner-only Telegram bot configuration.
//
// The bot token is a Vercel "sensitive" variable: it can be written but never
// read back, so the webhook can only be registered from inside the deployment
// — never from a laptop script. This route does that, and stays useful
// afterwards for re-registering after a domain change or a secret rotation.

export const maxDuration = 20;

interface TelegramResult {
  ok: boolean;
  description?: string;
  result?: unknown;
}

const COMMANDS = [
  { command: "today", description: "What is on today" },
  { command: "tasks", description: "Open tasks" },
  { command: "newtask", description: "New task from plain text" },
  { command: "recur", description: "Recurring task from plain text" },
  { command: "done", description: "Complete a task (/done <id>)" },
  { command: "uptime", description: "Website status" },
  { command: "ads", description: "Google Ads figures" },
  { command: "help", description: "All commands" },
];

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasRole(user.role, "owner")) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const base = (process.env.DASHBOARD_URL ?? new URL(request.url).origin).replace(/\/$/, "");

  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN ontbreekt" }, { status: 500 });
  }
  if (!secret) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET ontbreekt" }, { status: 500 });
  }

  const call = async (method: string, body?: unknown): Promise<TelegramResult> => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        cache: "no-store",
      });
      return (await res.json()) as TelegramResult;
    } catch (err) {
      return { ok: false, description: String(err) };
    }
  };

  const url = `${base}/api/telegram/webhook`;

  const set = await call("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    max_connections: 4,
    // A queue left over from a previous webhook only replays stale commands.
    drop_pending_updates: true,
  });
  if (!set.ok) {
    return NextResponse.json(
      { error: "setWebhook mislukt", details: set.description },
      { status: 502 }
    );
  }

  await call("setMyCommands", { commands: COMMANDS });
  const info = await call("getWebhookInfo");

  const w = (info.result ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    url: typeof w.url === "string" ? w.url : null,
    pendingUpdates: typeof w.pending_update_count === "number" ? w.pending_update_count : null,
    lastError: typeof w.last_error_message === "string" ? w.last_error_message : null,
    commands: COMMANDS.length,
  });
}

/** Same shape as POST, without changing anything — for a "is it still wired up?" check. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasRole(user.role, "owner")) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN ontbreekt" }, { status: 500 });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      cache: "no-store",
    });
    const data = (await res.json()) as TelegramResult;
    const w = (data.result ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      ok: data.ok,
      url: typeof w.url === "string" ? w.url : null,
      pendingUpdates: w.pending_update_count ?? null,
      lastError: w.last_error_message ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
