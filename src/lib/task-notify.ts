// Telegram ping when a task lands on someone's plate.
//
// The bot only ever talks to Kerim's chat, so this fires for any assignee, not
// just for him: when the client drops a task on the board, Kerim is the one who
// has to know within the minute. Self-assignment stays silent — he already got
// the confirmation when he created the task himself.
//
// Best-effort by design: a notification that fails must never fail the task
// creation that triggered it.

import { db } from "@/lib/db";
import { sendTelegram } from "@/lib/telegram";
import { logActivity } from "@/lib/activity-log";

const DASHBOARD_URL = (process.env.DASHBOARD_URL || "").replace(/\/$/, "");

export interface TaskAssignmentNotice {
  taskId: string;
  title: string;
  assigneeId: string | null;
  /** Who put it there. Null for system/cron-created work. */
  actorId: string | null;
  dueDate?: string | null;
  /** True when the task was materialised from a recurring rule. */
  recurring?: boolean;
}

export async function notifyTaskAssigned(n: TaskAssignmentNotice): Promise<void> {
  // Assigning something to yourself is not news.
  if (!n.assigneeId || n.assigneeId === n.actorId) return;

  try {
    const [assignee, actor] = await Promise.all([
      db.user.findUnique({
        where: { id: n.assigneeId },
        select: { name: true, username: true },
      }),
      n.actorId
        ? db.user.findUnique({
            where: { id: n.actorId },
            select: { name: true, username: true },
          })
        : Promise.resolve(null),
    ]);

    const assigneeName = assignee?.name || assignee?.username || "someone";
    const actorName = actor ? actor.name || actor.username : null;
    const shortId = n.taskId.slice(0, 8);

    const lines = [
      `${n.recurring ? "New recurring obligation" : "New task"} for ${assigneeName}`,
      n.title,
    ];
    if (actorName) lines.push(`From: ${actorName}`);
    if (n.dueDate) lines.push(`Due: ${n.dueDate}`);
    lines.push("", `Id: ${shortId}  (complete with /done ${shortId})`);
    // Straight to the task, not to the top of the board: the board opens one
    // task from `?task=`, and "which of these is the new one" is exactly the
    // question this ping exists to answer.
    if (DASHBOARD_URL) lines.push(`Board: ${DASHBOARD_URL}/dashboard/taken?task=${n.taskId}`);

    await sendTelegram(lines.join("\n"));

    // Dutch: this one renders in the client-facing notification bell.
    await logActivity("task_assigned", {
      title: n.title,
      detail: actorName
        ? `Toegewezen aan ${assigneeName} door ${actorName}`
        : `Toegewezen aan ${assigneeName}`,
      meta: n.taskId,
      actorId: n.actorId ?? "cron",
    });
  } catch (err) {
    // Never let a notification break the task that triggered it — but do not
    // swallow the failure either. A ping that quietly dies is worse than no
    // ping, because the whole point is that the task is impossible to miss.
    await logActivity("telegram_error", {
      title: "taakmelding",
      detail: String(err).slice(0, 200),
    });
  }
}
