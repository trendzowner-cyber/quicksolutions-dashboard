// Web push notifications (new reviews → employee phones).
//
// Node-only: web-push uses node's crypto and https, so this module must never
// be imported from middleware (Edge runtime) — route handlers and the sync
// route only. No-op until the VAPID envs are configured, like lib/telegram.ts.
//
// Dead subscriptions (404/410 from the push service — icon deleted from the
// home screen, permission revoked in iOS Settings) are deleted on the spot so
// the table only ever holds live devices. Nothing in here throws.

import webpush from "web-push";
import { db } from "./db";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:owner@quicksolutionspro.be";
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not configured — push is a no-op");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };

// ~10 at a time so one slow push service can't stall the whole batch.
const CHUNK_SIZE = 10;

async function sendPushToRows(
  rows: SubscriptionRow[],
  msg: PushMessage
): Promise<number> {
  let sent = 0;
  const chunks: SubscriptionRow[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify(msg)
          );
          await db.pushSubscription.updateMany({
            where: { endpoint: row.endpoint },
            data: { lastNotifiedAt: new Date() },
          });
          return true;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (
            statusCode === 404 ||
            statusCode === 410 ||
            (statusCode === 400 && !(error as Error).message.includes("vapid"))
          ) {
            // The subscription is dead (or malformed) — drop the row so the
            // table only holds live devices.
            await db.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
          }
          return false;
        }
      })
    );
    sent += results.filter((r) => r.status === "fulfilled" && r.value).length;
  }
  return sent;
}

/** Push to every subscribed device (all users). Returns how many were sent. */
export async function notifyAllPush(msg: PushMessage): Promise<number> {
  if (!ensureConfigured()) return 0;
  try {
    const rows = await db.pushSubscription.findMany({
      select: { endpoint: true, p256dh: true, auth: true },
    });
    if (rows.length === 0) return 0;
    return await sendPushToRows(rows, msg);
  } catch (error) {
    console.error("[push] notifyAllPush failed:", error);
    return 0;
  }
}

/** Push to one user's devices — used by the "Test" button. */
export async function notifyUserPush(userId: string, msg: PushMessage): Promise<number> {
  if (!ensureConfigured()) return 0;
  try {
    const rows = await db.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, p256dh: true, auth: true },
    });
    if (rows.length === 0) return 0;
    return await sendPushToRows(rows, msg);
  } catch (error) {
    console.error("[push] notifyUserPush failed:", error);
    return 0;
  }
}
