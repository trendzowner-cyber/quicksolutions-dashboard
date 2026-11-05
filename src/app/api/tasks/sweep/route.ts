// Recurring-task sweep — runs every 10 minutes via pg_cron.
//
// Three jobs, in order: make sure today's instance of every due recurring task
// exists on the board, remind once before the deadline, and ping once when the
// deadline has passed and nothing happened. The instance is a REAL Task row
// (deterministic id, so two overlapping runs can never create two), which
// means the board, the assignee, the done-checkbox and the calendar all work
// without knowing recurring tasks exist.
//
// It also closes the loop for the client-facing Workers view: a blogpost
// obligation is satisfied by the post being online, not by someone ticking a
// box. An open blog task is therefore checked against WordPress on every run
// and closed automatically once today's article is up. When it is ticked by
// hand instead, the newest post is attached to it — so "blogpost gedaan" comes
// with the actual link, or with a flag saying no post was published.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cronAuthorized, UNAUTHORIZED } from "@/lib/cron-auth";
import { logActivity } from "@/lib/activity-log";
import { sendTelegram } from "@/lib/telegram";
import { getPosts } from "@/lib/wp-client";
import { brusselsNow, effectiveCutoff, formatMinutes } from "@/lib/recurring";

export const maxDuration = 30;

function taskIdFor(recurringId: string, date: string): string {
  return `rc-${recurringId.slice(0, 10)}-${date.replace(/-/g, "")}`;
}

function isBlogTask(title: string, category: string): boolean {
  return category === "blog" || /blog/i.test(title);
}

/** Brussels calendar date for an unambiguous UTC stamp ("YYYY-MM-DDTHH:MM:SS"). */
function brusselsDateOf(iso: string): string | null {
  const at = new Date(`${iso}Z`);
  return Number.isNaN(at.getTime()) ? null : brusselsNow(at).date;
}

/**
 * Newest post from WordPress, but only counts when it went out today —
 * otherwise the link would point at last month's article while claiming
 * today's blogpost is done.
 *
 * "Today" is Brussels, and WordPress reports `date` in the *site's* timezone,
 * which is not necessarily ours — a post put out just after midnight would be
 * filed under yesterday and never earn its day. `date_gmt` has no such
 * ambiguity, so it decides when present; `date` stays as the fallback for a
 * site that does not publish it.
 */
async function todaysBlogPost(): Promise<{ title: string; link: string } | null> {
  try {
    const { data } = await getPosts({ per_page: "1", orderby: "date", order: "desc" });
    const post = data?.[0] as Record<string, unknown> | undefined;
    if (!post) return null;
    const link = typeof post.link === "string" ? post.link : null;
    if (!link) return null;

    const today = brusselsNow().date;
    const gmt = typeof post.date_gmt === "string" ? brusselsDateOf(post.date_gmt) : null;
    const local = typeof post.date === "string" ? post.date.slice(0, 10) : null;
    if (gmt !== today && local !== today) return null;

    return { title: String(post.title ?? link), link };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!(await cronAuthorized(request))) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  const now = brusselsNow();
  const log: string[] = [];

  try {
    const recurring = await db.recurringTask.findMany({
      where: { active: true, days: { has: now.isoDay } },
      orderBy: { deadlineMinutes: "asc" },
    });

    if (!recurring.length) {
      return NextResponse.json({ ok: true, date: now.date, materialized: 0, log: ["geen taken vandaag"] });
    }

    const todays = await db.task.findMany({
      where: {
        recurringTaskId: { in: recurring.map((r) => r.id) },
        date: now.date,
      },
    });

    let materialized = 0;

    for (const r of recurring) {
      let task = todays.find((t) => t.recurringTaskId === r.id);

      if (!task) {
        const id = taskIdFor(r.id, now.date);
        const highest = await db.task.aggregate({
          where: { status: "todo" },
          _max: { sortOrder: true },
        });
        try {
          task = await db.task.create({
            data: {
              id,
              title: r.title,
              description: r.description,
              category: r.category,
              status: "todo",
              priority: r.priority,
              date: now.date,
              dueDate: now.date,
              recurringTaskId: r.id,
              assigneeId: r.assigneeId,
              sortOrder: (highest._max.sortOrder ?? -1) + 1,
            },
          });
          materialized += 1;
        } catch (err) {
          // P2002 = a concurrent sweep won the race; its row is just as good.
          if (String(err).includes("P2002") || String(err).includes("Unique constraint")) {
            task = (await db.task.findUnique({ where: { id } })) ?? undefined;
          } else {
            throw err;
          }
        }
      }

      if (!task) continue;

      // ── Done ──
      if (task.status === "done") {
        if (r.lastCompletedDate !== now.date) {
          await db.recurringTask.update({
            where: { id: r.id },
            data: { lastCompletedDate: now.date },
          });

          if (isBlogTask(r.title, r.category) && !task.relatedEntityId) {
            const post = await todaysBlogPost();
            if (post) {
              await db.task.update({
                where: { id: task.id },
                data: { relatedEntityType: "blog", relatedEntityId: post.link },
              });
              log.push(`${r.title}: blogpost gevonden (${post.link})`);
            } else {
              log.push(`${r.title}: afgerond maar geen nieuwe blogpost vandaag`);
              await logActivity("recurring_reminder", {
                title: r.title,
                detail: "Afgerond, maar er staat vandaag geen nieuwe blogpost online",
                meta: task.id,
              });
            }
          }
          log.push(`${r.title}: afgerond`);
        }
        continue;
      }

      if (task.status === "cancelled") continue;

      // ── Published, therefore done ──
      // A blogpost is not a thing you tick; it is a thing that is either online
      // or not. So this runs on every sweep, for as long as the task is open:
      // publishing the post is what completes it, not a human agreeing that it
      // happened. `todaysBlogPost` only counts an article that went out today,
      // so yesterday's can never close today's obligation — and it returns null
      // on a WordPress error, which means an outage falls through to the normal
      // reminder instead of quietly marking a day done.
      if (isBlogTask(r.title, r.category)) {
        const post = await todaysBlogPost();
        if (post) {
          await db.task.update({
            where: { id: task.id },
            data: {
              status: "done",
              completedAt: new Date(),
              relatedEntityType: "blog",
              relatedEntityId: post.link,
            },
          });
          await db.recurringTask.update({
            where: { id: r.id },
            data: { lastCompletedDate: now.date },
          });
          await sendTelegram(
            [
              `Blogpost published — ${r.title} closed automatically`,
              post.link,
              "Done on the board, no action needed.",
            ].join("\n")
          );
          await logActivity("recurring_completed", {
            title: r.title,
            detail: "Automatisch afgerond: de blogpost staat online",
            meta: task.id,
          });
          log.push(`${r.title}: blogpost online (${post.link}), automatisch afgerond`);
          continue;
        }
      }

      // ── Reminder / miss ──
      // The nag is tied to the cut-off, not the deadline: with a late-until of
      // 18:00 on a 15:00 blogpost, the window between them is the point — the
      // target keeps you honest, the cut-off decides whether the day failed.
      const cutoff = effectiveCutoff(r.deadlineMinutes, r.lateUntilMinutes);
      if (now.minutes >= cutoff) {
        if (r.lastMissedDate !== now.date) {
          await db.recurringTask.update({
            where: { id: r.id },
            data: { lastMissedDate: now.date },
          });
          await sendTelegram(
            [
              `DEADLINE MISSED — ${r.title}`,
              cutoff > r.deadlineMinutes
                ? `It is ${formatMinutes(now.minutes)}. The ${formatMinutes(r.deadlineMinutes)} deadline and the ${formatMinutes(cutoff)} cut-off have both passed.`
                : `It is ${formatMinutes(now.minutes)}, the deadline was ${formatMinutes(r.deadlineMinutes)}.`,
              "The task is still open in the dashboard.",
            ].join("\n")
          );
          await logActivity("recurring_missed", {
            title: r.title,
            detail: `Deadline ${formatMinutes(r.deadlineMinutes)} gemist`,
            meta: task.id,
          });
          log.push(`${r.title}: deadline gemist, ping verzonden`);
        }
      } else if (now.minutes >= r.deadlineMinutes - r.remindBeforeMinutes) {
        if (r.lastRemindedDate !== now.date) {
          await db.recurringTask.update({
            where: { id: r.id },
            data: { lastRemindedDate: now.date },
          });
          const left = r.deadlineMinutes - now.minutes;
          await sendTelegram(
            [
              `Reminder — ${r.title}`,
              `${left} min left until the ${formatMinutes(r.deadlineMinutes)} deadline.`,
            ].join("\n")
          );
          await logActivity("recurring_reminder", {
            title: r.title,
            detail: `Deadline ${formatMinutes(r.deadlineMinutes)}`,
            meta: task.id,
          });
          log.push(`${r.title}: herinnering verzonden`);
        }
      }
    }

    return NextResponse.json({ ok: true, date: now.date, materialized, log });
  } catch (error) {
    return NextResponse.json(
      { error: "Sweep failed", details: String(error) },
      { status: 500 }
    );
  }
}
