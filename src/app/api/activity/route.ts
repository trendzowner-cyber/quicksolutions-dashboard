import { NextResponse } from "next/server";
import { getSessionUser, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACTION_LABELS, OUTCOME_NL } from "@/lib/review-outcomes";

const SYSTEM_EVENT_HREF: Record<string, string> = {
  uptime_down: "/dashboard/status",
  uptime_up: "/dashboard/status",
  ads_digest: "/dashboard",
  briefing: "/dashboard",
  task_created_telegram: "/dashboard/taken",
  task_assigned: "/dashboard/taken",
  recurring_created: "/dashboard/taken",
  recurring_reminder: "/dashboard/taken",
  recurring_completed: "/dashboard/taken",
  recurring_missed: "/dashboard/taken",
  telegram_error: "/dashboard/instellingen",
};

// Task events carry the task id in `meta`, and the board already knows how to
// open one task from `?task=`. So a notification lands on the thing it is
// about instead of the top of a sorted list — the difference between "your
// task is somewhere on the board" and "here is your task".
// Only the events whose `meta` really is a task id: `recurring_created` stores
// the rule's id instead, so it keeps the plain board link.
const TASK_EVENT_PREFIX: Record<string, string> = {
  task_assigned: "/dashboard/taken?task=",
  recurring_reminder: "/dashboard/taken?task=",
  recurring_completed: "/dashboard/taken?task=",
  recurring_missed: "/dashboard/taken?task=",
};

function systemEventHref(type: string, meta: string | null): string {
  const prefix = TASK_EVENT_PREFIX[type];
  if (prefix && meta) return prefix + encodeURIComponent(meta);
  return SYSTEM_EVENT_HREF[type] ?? "/dashboard";
}

function systemEventText(type: string, title: string | null): string {
  const t = title ?? "";
  switch (type) {
    case "uptime_down":
      return `Site ligt eruit: ${t}`;
    case "uptime_up":
      return `Site weer online: ${t}`;
    case "ads_digest":
      return t || "Advertentierapport verzonden";
    case "briefing":
      return t || "Ochtendbriefing verzonden";
    case "task_created_telegram":
      return `Taak via Telegram: ${t}`;
    case "task_assigned":
      return `Taak toegewezen: ${t}`;
    case "recurring_created":
      return `Terugkerende taak: ${t}`;
    case "recurring_reminder":
      return `Herinnering: ${t}`;
    case "recurring_completed":
      return `Automatisch afgerond: ${t}`;
    case "recurring_missed":
      return `Deadline gemist: ${t}`;
    case "telegram_error":
      return "Telegram-bot fout";
    default:
      return t || type;
  }
}

// GET → team activity feed: every review action (reported, noted, paid,
// removed, came back...), plus sync runs that actually changed something.
// The notification bell polls this every 30s; read tracking is per user.
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getSessionUser();
  const userId = user?.userId ?? "anon";

  const [actions, syncLogs, systemEvents, readRow] = await Promise.all([
    db.reviewAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        review: { select: { id: true, reviewerName: true, starRating: true } },
      },
    }),
    db.reviewSyncLog.findMany({
      where: { status: { not: "running" } },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    // System events (uptime flips, cron digests, Telegram-bot actions). They
    // carry actorId "cron", which never equals a user id — so unlike a review
    // action, a system event dings every user including whoever caused it.
    db.activityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.notificationRead.findUnique({ where: { userId } }),
  ]);

  type FeedEvent = {
    id: string;
    type: string;
    text: string;
    detail: string | null;
    time: string;
    href: string;
    actorId: string | null;
  };

  const events: FeedEvent[] = actions.map((a) => {
    const name = `${a.review.reviewerName} (${a.review.starRating}★)`;
    const href = `/dashboard/reviews?highlight=${a.review.id}`;
    const base = {
      id: a.id,
      time: a.createdAt.toISOString(),
      href,
      actorId: a.actorId,
    };
    switch (a.action) {
      case "reported":
        return { ...base, type: a.action, text: `Review gerapporteerd: ${name}`, detail: a.detail };
      case "unreported":
        return { ...base, type: a.action, text: `Rapport ongedaan gemaakt: ${name}`, detail: a.detail };
      case "outcome_set":
        return {
          ...base,
          type: a.action,
          text: `Uitkomst bijgewerkt: ${name}`,
          detail: a.detail ? (OUTCOME_NL[a.detail] ?? a.detail) : null,
        };
      case "followup_done":
        return { ...base, type: a.action, text: `Opnieuw gecontroleerd: ${name}`, detail: a.detail };
      case "note_added":
        return { ...base, type: a.action, text: `Notitie bij ${name}`, detail: a.detail };
      case "reply_posted":
        return { ...base, type: a.action, text: `Antwoord geplaatst op ${name}`, detail: a.detail };
      case "reply_deleted":
        return { ...base, type: a.action, text: `Antwoord verwijderd: ${name}`, detail: a.detail };
      case "created":
        return { ...base, type: a.action, text: `Nieuwe review: ${name}`, detail: a.detail };
      case "removed":
        return { ...base, type: a.action, text: `Review weg van Google: ${name}`, detail: a.detail };
      case "merged":
        return { ...base, type: a.action, text: `Review gekoppeld aan Google: ${name}`, detail: a.detail };
      case "removal_ready":
        return { ...base, type: a.action, text: `Klaar voor verwijdering: ${name}`, detail: a.detail };
      case "removal_sent":
        return { ...base, type: a.action, text: `Verzonden naar verwijderaar: ${name}`, detail: a.detail };
      case "removal_paid":
        return { ...base, type: a.action, text: `Verwijderaar betaald: ${name}`, detail: a.detail };
      case "removal_cancelled":
        return { ...base, type: a.action, text: `Uit verwijderpijplijn gehaald: ${name}`, detail: a.detail };
      case "came_back":
        return { ...base, type: a.action, text: `Review teruggekomen op Google: ${name}`, detail: a.detail };
      case "edited":
        return { ...base, type: a.action, text: `Review bewerkt en terug bovenaan: ${name}`, detail: a.detail };
      case "auto_replied":
        return { ...base, type: a.action, text: `Automatisch bedankt: ${name}`, detail: a.detail };
      case "case_set":
        return { ...base, type: a.action, text: `Google-case toegevoegd: ${name}`, detail: a.detail };
      case "escalated":
        return { ...base, type: a.action, text: `Geëscaleerd bij Google: ${name}`, detail: a.detail };
      case "task_created":
        return { ...base, type: a.action, text: `Teamtaak aangemaakt: ${name}`, detail: a.detail };
      default:
        return { ...base, type: a.action, text: `${ACTION_LABELS[a.action] ?? a.action}: ${name}`, detail: a.detail };
    }
  });

  // Sync runs: only surface the ones that changed something (or failed) —
  // a quiet "nothing new" run every 15 min is not news.
  for (const s of syncLogs) {
    const time = (s.finishedAt ?? s.startedAt).toISOString();
    if (s.status === "error") {
      events.push({
        id: `sync-${s.id}`,
        type: "sync_error",
        text: "Reviewsync mislukt",
        detail: s.error?.slice(0, 160) ?? null,
        time,
        href: "/dashboard/reviews",
        actorId: "sync",
      });
    } else if (s.newCount > 0 || s.removedCount > 0) {
      events.push({
        id: `sync-${s.id}`,
        type: "sync",
        text: `Reviews gesynchroniseerd: ${s.newCount} nieuw, ${s.removedCount} weg`,
        detail: null,
        time,
        href: "/dashboard/reviews",
        actorId: "sync",
      });
    }
  }

  // System events. Prefixed ids: ActivityEvent and ReviewAction both use cuids,
  // so unprefixed ids could collide in the React key.
  for (const e of systemEvents) {
    events.push({
      id: `activity-${e.id}`,
      type: e.type,
      text: systemEventText(e.type, e.title),
      detail: e.detail,
      time: e.createdAt.toISOString(),
      href: systemEventHref(e.type, e.meta),
      actorId: e.actorId,
    });
  }

  events.sort((a, b) => (a.time < b.time ? 1 : -1));
  const top = events.slice(0, 40);

  // Unread = events after the user's last read moment, excluding their own
  // actions (you don't need a bell for what you just did yourself).
  const lastReadAt = readRow?.lastReadAt;
  const unread = top.filter(
    (e) => (!lastReadAt || e.time > lastReadAt.toISOString()) && e.actorId !== userId
  ).length;

  return NextResponse.json(
    { events: top, unread, me: userId },
    { headers: { "Cache-Control": "no-store" } }
  );
}
