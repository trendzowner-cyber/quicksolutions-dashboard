// The 08:00 Telegram briefing: what the day looks like before the client
// starts asking. Site status, what is due today, what is already late, and
// which recurring obligations are still open.

import { db } from "@/lib/db";
import { fetchUptimeMonitors, targetLabel } from "@/lib/uptime";
import {
  brusselsNow,
  formatISOLongEN,
  formatMinutes,
} from "@/lib/recurring";
import { priorityMeta } from "@/lib/tasks";

/** The dashboard is Dutch for the client; this message is Kerim's own. */
const PRIORITY_EN: Record<string, string> = {
  low: "low",
  normal: "normal",
  high: "high",
  urgent: "URGENT",
};

export async function buildMorningBriefing(): Promise<string> {
  const now = brusselsNow();

  const [dueToday, overdue, recurring, monitors] = await Promise.all([
    db.task.findMany({
      where: { dueDate: now.date, status: { notIn: ["done", "cancelled"] } },
      select: { title: true, priority: true },
      take: 20,
    }),
    db.task.findMany({
      where: { dueDate: { lt: now.date }, status: { notIn: ["done", "cancelled"] } },
      select: { title: true, dueDate: true, priority: true },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    db.recurringTask.findMany({
      where: { active: true, days: { has: now.isoDay } },
      orderBy: { deadlineMinutes: "asc" },
    }),
    fetchUptimeMonitors().catch(() => []),
  ]);

  const lines: string[] = [`Good morning — ${formatISOLongEN(now.date)}`, ""];

  // ── Site ──
  if (monitors.length) {
    const downCount = monitors.filter((m) => m.status === "down").length;
    if (downCount === 0) {
      const worst = monitors.reduce(
        (min, m) => (m.uptime24h !== null && m.uptime24h < min ? m.uptime24h : min),
        100
      );
      lines.push(`Site: online (worst 24h uptime: ${worst.toFixed(2)}%)`);
    } else {
      const down = monitors.filter((m) => m.status === "down");
      lines.push(
        `Site: ${downCount} of ${monitors.length} in trouble — ${down
          .map((m) => `${targetLabel(m.target)} (${m.statusCode ?? "no response"})`)
          .join(", ")}`
      );
    }
  }

  // ── Recurring obligations ──
  if (recurring.length) {
    const doneIds = new Set(
      (
        await db.task.findMany({
          where: {
            recurringTaskId: { in: recurring.map((r) => r.id) },
            date: now.date,
            status: "done",
          },
          select: { recurringTaskId: true },
        })
      ).map((t) => t.recurringTaskId)
    );

    lines.push("", "Recurring today:");
    for (const r of recurring) {
      const mark = doneIds.has(r.id) ? "done" : `deadline ${formatMinutes(r.deadlineMinutes)}`;
      lines.push(`  - ${r.title} (${mark})`);
    }
  }

  // ── Tasks ──
  if (dueToday.length) {
    lines.push("", `Due today (${dueToday.length}):`);
    for (const t of dueToday.slice(0, 8)) {
      const key = priorityMeta(t.priority).key;
      lines.push(`  - ${t.title}${key === "normal" ? "" : ` [${PRIORITY_EN[key] ?? key}]`}`);
    }
  }

  if (overdue.length) {
    lines.push("", `Overdue (${overdue.length}):`);
    for (const t of overdue.slice(0, 6)) {
      lines.push(`  - ${t.title} (was ${t.dueDate})`);
    }
  }

  if (!dueToday.length && !overdue.length && !recurring.length) {
    lines.push("", "Nothing due today.");
  }

  return lines.join("\n");
}
