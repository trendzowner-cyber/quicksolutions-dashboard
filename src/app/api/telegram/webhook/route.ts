// Inbound Telegram webhook — the only way the bot hears anything.
//
// Registered with setWebhook (see the SQL/deploy notes): Telegram POSTs every
// message here with the secret in X-Telegram-Bot-Api-Secret-Token. Two rules
// matter: answer 200 whenever the call is authentic (Telegram retries non-200
// forever and eventually gives up on the endpoint), and persist the update_id
// BEFORE doing any work, so a retry after a timeout can never create a second
// task from the same message.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { telegramWebhookAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { handleTelegramMessage, clipTelegramReply } from "@/lib/telegram-commands";
import { logActivity } from "@/lib/activity-log";
import { sendTelegram } from "@/lib/telegram";

export const maxDuration = 30;

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number };
    from?: { id?: number };
  };
}

export async function POST(request: Request) {
  if (!telegramWebhookAuthorized(request)) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const updateId = update.update_id;
  if (typeof updateId !== "number") return NextResponse.json({ ok: true });

  // Claim the update before processing: a Telegram retry arrives with the same
  // id and must be a no-op even if the first attempt is still running.
  const state = await db.telegramState.findUnique({ where: { id: "main" } });
  if (state && BigInt(updateId) <= state.lastUpdateId) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  await db.telegramState.upsert({
    where: { id: "main" },
    create: { id: "main", lastUpdateId: BigInt(updateId) },
    update: { lastUpdateId: BigInt(updateId) },
  });

  // The bot is personal: anything from another chat is ignored silently.
  const allowedChat = process.env.TELEGRAM_CHAT_ID;
  const chatId = update.message?.chat?.id;
  if (!allowedChat || String(chatId) !== String(allowedChat)) {
    return NextResponse.json({ ok: true, ignored: "chat" });
  }

  try {
    const reply = await handleTelegramMessage({
      text: update.message?.text,
      fromId: update.message?.from?.id,
    });
    if (reply) await sendTelegram(clipTelegramReply(reply));
  } catch (err) {
    await logActivity("telegram_error", {
      title: "onverwerkte fout",
      detail: String(err).slice(0, 300),
    });
    await sendTelegram(`Something went wrong: ${String(err).slice(0, 200)}`).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
