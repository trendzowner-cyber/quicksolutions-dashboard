// Telegram command handling — the inbound half of the bot.
//
// The bot is personal: only TELEGRAM_CHAT_ID may talk to it, and everything it
// does is attributed to the owner user. Two of the commands exist purely to
// remove friction: /newtask turns a messy sentence into a proper board task,
// and /recur turns one into a standing obligation. Adding a recurring task has
// to be a ten-second sentence, because with this client there is always
// another one coming.
//
// Replies are English: the only reader is Kerim. The dashboard it writes into
// stays Dutch for the client.

import { db } from "@/lib/db";
import { callDeepSeekJSON } from "@/lib/deepseek";
import { logActivity } from "@/lib/activity-log";
import { fetchUptimeMonitors, targetLabel } from "@/lib/uptime";
import {
  brusselsNow,
  dayLabelEN,
  describeDays, // Dutch — the activity feed in the dashboard is the client's
  describeDaysEN,
  formatMinutes,
  parseTimeToMinutes,
  shiftISO,
} from "@/lib/recurring";
import {
  TASK_CATEGORIES,
  normalizePriority,
  priorityMeta,
  type TaskPriority,
} from "@/lib/tasks";
import {
  ADS_ACCOUNTS,
  AdsAuthError,
  accountLabel,
  averageCpcOf,
  ctrOf,
  fetchDailyTotals,
  getAdAccessToken,
} from "@/lib/google-ads";

const MAX_REPLY = 3900; // Telegram hard-caps at 4096
const OPEN_STATUSES = ["backlog", "todo", "in_progress", "waiting"];

/** Task priorities are stored with Dutch labels for the board; the bot is English. */
const PRIORITY_EN: Record<string, string> = {
  low: "low",
  normal: "normal",
  high: "high",
  urgent: "URGENT",
};

function priorityEN(key: string): string {
  return PRIORITY_EN[key] ?? key;
}

/** Telegram caps messages at 4096 chars; a long task list must never make the
 *  whole reply disappear (sendMessage rejects the entire payload). */
function clip(text: string): string {
  return text.length <= MAX_REPLY ? text : `${text.slice(0, MAX_REPLY - 20)}\n… (truncated)`;
}

/** The account the bot acts as.
 *
 *  It has to be Kerim's own account: "the oldest owner" is the legacy `owner`
 *  login, so every task the bot created landed on a board nobody looks at and
 *  kept resurrecting a phantom "Owner" card on the Workers view. The fallback
 *  stays so a renamed account can never take the whole bot offline. */
const BOT_OWNER_EMAIL = "kerim@quicksolutionspro.be";

async function botUser() {
  return (
    (await db.user.findFirst({
      where: { email: BOT_OWNER_EMAIL, status: "active" },
    })) ??
    (await db.user.findFirst({
      where: { role: "owner", status: "active" },
      orderBy: { createdAt: "desc" },
    }))
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

async function appendSortOrder(status: string): Promise<number> {
  const highest = await db.task.aggregate({ where: { status }, _max: { sortOrder: true } });
  return (highest._max.sortOrder ?? -1) + 1;
}

const CATEGORY_KEYS = TASK_CATEGORIES as readonly string[];

function pickCategory(value: unknown): string {
  const v = String(value ?? "").toLowerCase().trim();
  return CATEGORY_KEYS.includes(v) ? v : "algemeen";
}

// ─── /newtask ───

interface NewTaskDraft {
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  category?: string;
  subtasks?: string[];
}

async function createTaskFromText(text: string): Promise<string> {
  const owner = await botUser();
  if (!owner) return "No owner account found in the dashboard.";

  const today = brusselsNow().date;
  const tomorrow = shiftISO(today, 1);

  let draft: NewTaskDraft;
  try {
    draft = await callDeepSeekJSON<NewTaskDraft>({
      systemPrompt:
        "You turn a rough note from a marketer into one structured task for a task board.\n" +
        `Today is ${today}, tomorrow is ${tomorrow}. Resolve relative dates ("tomorrow", "next monday") into YYYY-MM-DD.\n` +
        `Category must be one of: ${CATEGORY_KEYS.join(", ")}.\n` +
        'Priority must be "low", "normal", "high" or "urgent" — pick "normal" when nothing is said.\n' +
        "Write title and description in the SAME LANGUAGE as the note.\n" +
        "Answer with JSON ONLY: " +
        '{"title": "short title", "description": "1-2 sentences of context", "priority": "normal", "dueDate": "YYYY-MM-DD or null", "category": "algemeen", "subtasks": ["step 1", "step 2"]}. ' +
        "No other text. At most 5 subtasks, leave subtasks empty when there are no obvious steps.",
      userPrompt: text,
      temperature: 0.3,
      maxTokens: 600,
    });
  } catch {
    // The AI is a convenience, not a requirement — the raw text is still a
    // perfectly good task title.
    draft = { title: text };
  }

  const title = (draft.title || text).trim().slice(0, 200);
  const dueDate =
    typeof draft.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)
      ? draft.dueDate
      : null;
  const subtasks = Array.isArray(draft.subtasks)
    ? draft.subtasks
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .slice(0, 10)
    : [];

  const task = await db.task.create({
    data: {
      title,
      description: draft.description?.trim() || null,
      category: pickCategory(draft.category),
      status: "backlog",
      priority: normalizePriority(draft.priority),
      date: today,
      dueDate,
      tags: [],
      sortOrder: await appendSortOrder("backlog"),
      assigneeId: owner.id,
      creatorId: owner.id,
      subtasks: subtasks.length
        ? { create: subtasks.map((s, i) => ({ title: s.slice(0, 200), order: i })) }
        : undefined,
    },
  });

  await logActivity("task_created_telegram", {
    title,
    detail: dueDate ? `Deadline ${dueDate}` : null,
    meta: task.id,
    actorId: owner.id,
  });

  const lines = [
    "Task created",
    `Title: ${title}`,
    `Category: ${pickCategory(draft.category)}   Priority: ${priorityEN(priorityMeta(task.priority).key)}`,
    `Due: ${dueDate ?? "none"}`,
  ];
  if (subtasks.length) lines.push(`Subtasks: ${subtasks.length}`);
  lines.push("", `Id: ${shortId(task.id)}  (complete with /done ${shortId(task.id)})`);
  return lines.join("\n");
}

// ─── /recur ───

interface RecurDraft {
  title?: string;
  description?: string;
  days?: number[];
  deadline?: string;
  /** Optional end-of-day cut-off, "HH:MM". Omit when the deadline is hard. */
  lateUntil?: string;
  priority?: string;
  category?: string;
  remindBeforeMinutes?: number;
}

function normalizeDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = [
    ...new Set(
      value
        .map((d) => Math.trunc(Number(d)))
        .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
    ),
  ];
  return days.sort((a, b) => a - b);
}

async function createRecurringFromText(text: string): Promise<string> {
  const today = brusselsNow();

  let draft: RecurDraft;
  try {
    draft = await callDeepSeekJSON<RecurDraft>({
      systemPrompt:
        "You turn a loose sentence into a recurring obligation for a marketer.\n" +
        `Today is ${today.date} and it is ${dayLabelEN(today.isoDay)}.\n` +
        "days is a list of ISO day numbers: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday. " +
        '"every weekday" = [1,2,3,4,5], "every day" = [1,2,3,4,5,6,7], "every monday" = [1].\n' +
        'deadline is "HH:MM" in 24-hour format (e.g. "15:00"). If no time is given, use "17:00".\n' +
        'lateUntil is optional: set it ONLY when the sentence states an end of the working day that is later than the deadline ' +
        '(e.g. "before 15:00 but by end of day" -> deadline "15:00", lateUntil "18:00"). Otherwise use null.\n' +
        `Category must be one of: ${CATEGORY_KEYS.join(", ")}.\n` +
        "Write title and description in the SAME LANGUAGE as the sentence.\n" +
        "Answer with JSON ONLY: " +
        '{"title": "short title", "description": "1 sentence of context", "days": [1,2,3,4,5], "deadline": "15:00", "lateUntil": null, "priority": "normal", "category": "algemeen", "remindBeforeMinutes": 30}. ' +
        "No other text.",
      userPrompt: text,
      temperature: 0.3,
      maxTokens: 500,
    });
  } catch {
    return (
      "Could not turn that sentence into a recurring task.\n" +
      'Try: /recur post the blogpost every weekday before 15:00'
    );
  }

  const days = normalizeDays(draft.days);
  if (!days.length) {
    return (
      "No valid days recognised.\n" +
      'State the days explicitly, e.g: /recur blogpost every weekday before 15:00'
    );
  }

  const deadlineMinutes =
    typeof draft.deadline === "string" ? parseTimeToMinutes(draft.deadline) ?? 1020 : 1020;
  // Optional grace window: "before 15:00, but the day runs to 18:00".
  const lateUntilParsed =
    typeof draft.lateUntil === "string" ? parseTimeToMinutes(draft.lateUntil) : null;
  const lateUntilMinutes =
    lateUntilParsed !== null && lateUntilParsed > deadlineMinutes ? lateUntilParsed : null;
  const remind =
    Number.isFinite(Number(draft.remindBeforeMinutes)) && Number(draft.remindBeforeMinutes) > 0
      ? Math.min(600, Math.trunc(Number(draft.remindBeforeMinutes)))
      : 30;

  const title = (draft.title || text).trim().slice(0, 200);
  const category = pickCategory(draft.category);

  // Without an assignee the obligation belongs to nobody: it never appears on
  // anyone's worker card, so a daily added by sentence was invisible on the
  // screen built to show it.
  const owner = await botUser();

  const recurring = await db.recurringTask.create({
    data: {
      title,
      description: draft.description?.trim() || null,
      category,
      priority: normalizePriority(draft.priority),
      days,
      deadlineMinutes,
      lateUntilMinutes,
      remindBeforeMinutes: remind,
      timezone: "Europe/Brussels",
      assigneeId: owner?.id ?? null,
      active: true,
    },
  });
  await logActivity("recurring_created", {
    title,
    detail: `${describeDays(days)} voor ${formatMinutes(deadlineMinutes)}`,
    meta: recurring.id,
    actorId: owner?.id ?? "cron",
  });

  return [
    "Recurring task created",
    `Title: ${title}`,
    `When: ${describeDaysEN(days)}`,
    `Deadline: ${formatMinutes(deadlineMinutes)}`,
    ...(lateUntilMinutes
      ? [`Late until: ${formatMinutes(lateUntilMinutes)} (still counts as done)`]
      : []),
    `Reminder: ${remind} min before`,
    "",
    "You get a reminder before the deadline and a ping if you miss it.",
    "Edit or pause it in the dashboard under Taken → Terugkerend.",
  ].join("\n");
}

// ─── /tasks, /done, /today, /uptime, /ads ───

async function listOpenTasks(): Promise<string> {
  const tasks = await db.task.findMany({
    where: { status: { in: OPEN_STATUSES } },
    select: { id: true, title: true, priority: true, dueDate: true, status: true },
    take: 100,
  });

  if (!tasks.length) return "No open tasks.";

  tasks.sort((a, b) => {
    const w = priorityMeta(b.priority).weight - priorityMeta(a.priority).weight;
    if (w !== 0) return w;
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  const today = brusselsNow().date;
  const lines = [`Open tasks (${tasks.length}):`];
  for (const t of tasks.slice(0, 15)) {
    const overdue = t.dueDate && t.dueDate < today ? " — OVERDUE" : "";
    const due = t.dueDate ? ` (${t.dueDate}${overdue})` : "";
    lines.push(`  ${shortId(t.id)}  ${t.title}${due}`);
  }
  if (tasks.length > 15) lines.push(`  … and ${tasks.length - 15} more`);
  lines.push("", "Complete with: /done <id>");
  return lines.join("\n");
}

async function completeTask(prefix: string): Promise<string> {
  if (prefix.length < 4) return "Give at least 4 characters of the id: /done a1b2c3d4";

  const matches = await db.task.findMany({
    where: { id: { startsWith: prefix }, status: { in: OPEN_STATUSES } },
    select: { id: true, title: true },
    take: 5,
  });

  if (!matches.length) return `No open task found with id ${prefix}.`;
  if (matches.length > 1) {
    return [
      `Several tasks start with ${prefix}:`,
      ...matches.map((m) => `  ${shortId(m.id)}  ${m.title}`),
      "",
      "Give more characters.",
    ].join("\n");
  }

  const task = matches[0];
  await db.task.update({
    where: { id: task.id },
    data: { status: "done", completedAt: new Date() },
  });

  // A finished recurring task is what closes the loop for the client view —
  // the sweep picks the completion date up from here.
  return `Done: ${task.title}`;
}

async function todayOverview(): Promise<string> {
  const now = brusselsNow();

  const [dueToday, overdue, recurring, monitors] = await Promise.all([
    db.task.findMany({
      where: { dueDate: now.date, status: { in: OPEN_STATUSES } },
      select: { title: true },
    }),
    db.task.count({ where: { dueDate: { lt: now.date }, status: { in: OPEN_STATUSES } } }),
    db.recurringTask.findMany({
      where: { active: true, days: { has: now.isoDay } },
      orderBy: { deadlineMinutes: "asc" },
      select: { title: true, deadlineMinutes: true },
    }),
    fetchUptimeMonitors().catch(() => []),
  ]);

  const lines = [`Today — ${now.date}`, ""];

  if (monitors.length) {
    const down = monitors.filter((m) => m.status === "down");
    lines.push(
      down.length
        ? `Site: ${down.map((m) => `${targetLabel(m.target)} IS DOWN`).join(", ")}`
        : "Site: online"
    );
  }

  if (recurring.length) {
    lines.push("", "Recurring today:");
    for (const r of recurring) lines.push(`  ${formatMinutes(r.deadlineMinutes)}  ${r.title}`);
  }

  if (dueToday.length) {
    lines.push("", `Due today (${dueToday.length}):`);
    for (const t of dueToday.slice(0, 10)) lines.push(`  - ${t.title}`);
  }

  if (overdue) lines.push("", `Overdue: ${overdue} task(s)`);
  if (!recurring.length && !dueToday.length && !overdue) lines.push("", "Nothing scheduled today.");

  return lines.join("\n");
}

async function uptimeStatus(): Promise<string> {
  const monitors = await fetchUptimeMonitors().catch(() => []);
  if (!monitors.length) return "No uptime measurements found.";

  const lines = ["Site status:"];
  for (const m of monitors) {
    const icon = m.status === "up" ? "ONLINE" : m.status === "down" ? "DOWN" : "UNKNOWN";
    const code = m.statusCode ?? "no response";
    const uptime = m.uptime24h !== null ? `${m.uptime24h.toFixed(2)}% (24h)` : "no data";
    lines.push(`  ${targetLabel(m.target)}: ${icon} — ${code}, ${uptime}`);
  }
  return lines.join("\n");
}

async function adsNow(): Promise<string> {
  const now = brusselsNow();
  let token: string;
  try {
    token = await getAdAccessToken();
  } catch (err) {
    if (err instanceof AdsAuthError) return err.message;
    throw err;
  }

  const lines: string[] = [];

  for (const id of ADS_ACCOUNTS) {
    const label = accountLabel(id);
    try {
      // Google reports today's spend with a lag of a few hours, so an empty
      // today falls back to yesterday rather than showing a misleading €0.
      let range = "TODAY";
      let result = await fetchDailyTotals(token, id, range);
      if (result.totals.impressions === 0) {
        range = "YESTERDAY";
        result = await fetchDailyTotals(token, id, range);
      }
      const day = range === "TODAY" ? now.date : shiftISO(now.date, -1);
      const t = result.byDate[day] ?? result.totals;
      lines.push(
        `${label} (${range === "TODAY" ? "today" : day}):`,
        `  ${(t.costMicros / 1_000_000).toFixed(2)} EUR, ${Math.round(t.clicks)} clicks, ${Math.round(t.impressions)} impressions`,
        `  ${t.conversions.toFixed(1)} conversions, CTR ${(ctrOf(t) * 100).toFixed(2)}%, CPC ${averageCpcOf(t).toFixed(2)} EUR`
      );
      if (t.impressionShare !== null) {
        lines.push(`  Search impression share ${(t.impressionShare * 100).toFixed(0)}%`);
      }
    } catch (err) {
      lines.push(`${label}: error — ${String(err).slice(0, 120)}`);
    }
  }

  lines.push("", "Full report every morning around 08:30.");
  return lines.join("\n");
}

const HELP = [
  "Available commands",
  "",
  "/newtask <text> — turns your rough text into a proper task",
  "   e.g. /newtask new promo funnel for quicksolutions",
  "",
  "/recur <sentence> — create a recurring task",
  "   e.g. /recur post the blogpost every weekday before 15:00",
  "",
  "/tasks — open tasks",
  "/done <id> — complete a task",
  "/today — what is on today + site status",
  "/uptime — website online/offline + 24h uptime",
  "/ads — ad figures right now",
  "/help — this list",
].join("\n");

// ─── Entry point ───

export async function handleTelegramMessage(message: {
  text?: string;
  fromId?: number;
}): Promise<string> {
  const raw = (message.text ?? "").trim();
  if (!raw) return "";

  const [command, ...rest] = raw.split(/\s+/);
  const args = rest.join(" ").trim();
  // Telegram sends /command@botname in groups.
  const cmd = command.split("@")[0].toLowerCase();

  try {
    switch (cmd) {
      case "/start":
      case "/help":
        return HELP;
      case "/newtask":
      case "/taak":
        if (!args) return "Usage: /newtask <what needs to happen>";
        return await createTaskFromText(args);
      case "/recur":
      case "/herhaal":
        if (!args) return "Usage: /recur <sentence>, e.g. /recur blogpost every weekday before 15:00";
        return await createRecurringFromText(args);
      case "/tasks":
      case "/taken":
        return await listOpenTasks();
      case "/done":
      case "/klaar":
        if (!args) return "Usage: /done <id>";
        return await completeTask(args.split(/\s+/)[0]);
      case "/today":
      case "/vandaag":
        return await todayOverview();
      case "/uptime":
        return await uptimeStatus();
      case "/ads":
        return await adsNow();
      default:
        return `Unknown command: ${cmd}\n\n${HELP}`;
    }
  } catch (err) {
    await logActivity("telegram_error", {
      title: cmd,
      detail: String(err).slice(0, 300),
    });
    return `Something went wrong with ${cmd}: ${String(err).slice(0, 200)}`;
  }
}

export { clip as clipTelegramReply };
