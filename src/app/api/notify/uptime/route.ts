// Uptime transition notifier.
//
// Called by the qs-uptime-notify pg_cron job, which compares the two most
// recent rows per target in monitoring.uptime_checks and posts only the flips.
// Everything stateful lives here: the incident row, the cooldown (an already
// open incident means we already told you), the flap suppression, and the
// Telegram message.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cronAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { logActivity } from "@/lib/activity-log";
import { targetLabel } from "@/lib/uptime";
import { sendTelegram } from "@/lib/telegram";

export const maxDuration = 15;

/** A target that drops again within this window is flapping. The incident is
 *  still recorded, but only one Telegram message goes out per window. */
const FLAP_WINDOW_MS = 5 * 60_000;

interface NotifyBody {
  target?: string;
  status?: "down" | "up";
  statusCode?: number | null;
  errorMsg?: string | null;
  checkedAt?: string;
}

function humanDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}u ${min % 60}min`;
}

export async function POST(request: Request) {
  if (!(await cronAuthorized(request))) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  let body: NotifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const target = body.target?.trim();
  const status = body.status;
  if (!target || (status !== "down" && status !== "up")) {
    return NextResponse.json({ error: "target en status zijn verplicht" }, { status: 400 });
  }

  const label = targetLabel(target);
  const openIncident = await db.uptimeIncident.findFirst({
    where: { target, status: "down", endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (status === "down") {
    if (openIncident) {
      return NextResponse.json({ ok: true, skipped: "al open incident" });
    }

    // Decide before inserting, so the row we are about to create cannot
    // suppress its own alert.
    const previous = await db.uptimeIncident.findFirst({
      where: { target },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    const flapping = !!previous && Date.now() - previous.startedAt.getTime() < FLAP_WINDOW_MS;

    const incident = await db.uptimeIncident.create({
      data: {
        target,
        status: "down",
        statusCode: body.statusCode ?? null,
        errorMsg: body.errorMsg?.slice(0, 500) ?? null,
        startedAt: body.checkedAt ? new Date(body.checkedAt) : new Date(),
      },
    });

    await logActivity("uptime_down", {
      title: label,
      detail: body.statusCode ? `HTTP ${body.statusCode}` : body.errorMsg ?? "geen antwoord",
      meta: incident.id,
    });

    if (!flapping) {
      await sendTelegram(
        [
          `SITE IS DOWN — ${label}`,
          body.statusCode ? `Status: HTTP ${body.statusCode}` : "Status: no response",
          body.errorMsg ? `Error: ${body.errorMsg.slice(0, 200)}` : null,
          "",
          "The incident is logged in the dashboard.",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    return NextResponse.json({ ok: true, incidentId: incident.id, alerted: !flapping });
  }

  // status === "up"
  if (!openIncident) {
    // Recovery without a recorded outage (e.g. a restart between checks) —
    // nothing to close and nothing worth saying.
    return NextResponse.json({ ok: true, skipped: "geen open incident" });
  }

  const endedAt = body.checkedAt ? new Date(body.checkedAt) : new Date();
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - openIncident.startedAt.getTime()) / 1000)
  );

  await db.uptimeIncident.update({
    where: { id: openIncident.id },
    data: { status: "resolved", endedAt, durationSec },
  });

  await logActivity("uptime_up", {
    title: label,
    detail: `Storing duurde ${humanDuration(durationSec)}`,
    meta: openIncident.id,
  });

  await sendTelegram(
    [`SITE IS BACK UP — ${label}`, `Outage lasted ${humanDuration(durationSec)}.`].join("\n")
  );

  return NextResponse.json({ ok: true, resolved: openIncident.id, durationSec });
}
