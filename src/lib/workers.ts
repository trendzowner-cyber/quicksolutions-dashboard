// Worker board — the data behind the client-facing "Workers" section.
//
// Azedine (the CEO) does not care about the board, the columns or the
// priorities: he wants to open one screen and see whether the person he pays
// actually did the work today. So this module answers exactly that question and
// nothing else — is X online, what was he supposed to do today, did he do it,
// and if it was the blogpost, where is the link.
//
// "Online" is presence, not truth: the dashboard pings /api/presence every
// minute while a tab is open, so a closed laptop goes offline on its own.

import { db } from "@/lib/db";
import {
  brusselsNow,
  brusselsMinutesOf,
  effectiveCutoff,
  isoDayOf,
  shiftISO,
  formatMinutes,
  formatISOLong,
} from "@/lib/recurring";
import { OPEN_STATUSES, priorityMeta, statusMeta } from "@/lib/tasks";

/** Presence window — one missed heartbeat must not flip the dot to grey. */
const ONLINE_WINDOW_MS = 3 * 60_000;

/** How many days of history the progress strip shows. */
const HISTORY_DAYS = 7;

/** Open rows rendered per card before it collapses into "+N meer". */
const OPEN_TASK_LIMIT = 6;

export type RecurringState = "done" | "late" | "missed" | "pending";

export interface WorkerRecurringItem {
  id: string;
  title: string;
  /** Deadline as "15:00" — the client reads a clock, not a minute count. */
  deadline: string;
  /** End-of-day cut-off as "18:00", or null when the deadline is hard. */
  lateUntil: string | null;
  state: RecurringState;
  /** Dutch one-liner: "Klaar om 14:12", "Nog 42 min", "Deadline voorbij". */
  stateText: string;
  /** Set when the recurring task produced something clickable (a blogpost). */
  link: string | null;
  linkLabel: string | null;
}

export interface WorkerDay {
  date: string;
  label: string;
  isToday: boolean;
  done: number;
  total: number;
  /** "done" | "partial" | "missed" | "none" — drives the colour of the bar. */
  outcome: "done" | "partial" | "missed" | "none" | "future";
}

/** One open board task, flattened for the card. Same rows the Taken board
 *  shows — this view just answers "what is he working on", not "how many". */
export interface WorkerOpenTask {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  priority: string;
  /** "Te laat", "Vandaag", "Morgen", "ma 14 sep" — or, undated, how long it has
   *  been sitting: "al 3 dagen open". */
  dueText: string;
  overdue: boolean;
  dueToday: boolean;
  /** Whether a deadline exists at all, for ordering — most tasks have none. */
  hasDue: boolean;
  createdAt: string;
}

export interface WorkerSummary {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  /** "zojuist", "12 min geleden", "3 u geleden", "gisteren"… */
  lastSeenText: string;
  todayDone: number;
  todayTotal: number;
  /** Total open board tasks, including any trimmed from openTaskList. */
  openTasks: number;
  /** The open work itself — capped for the card, worst deadline first. */
  openTaskList: WorkerOpenTask[];
  recurring: WorkerRecurringItem[];
  history: WorkerDay[];
}

export interface WorkersBoard {
  /** Brussels date the board was built for. */
  date: string;
  dateLabel: string;
  generatedAt: string;
  workers: WorkerSummary[];
}

function relativeTime(iso: string | null): string {
  if (!iso) return "nooit";
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "zojuist";
  if (mins < 60) return `${mins} min geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} u geleden`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "gisteren" : `${days} d geleden`;
}

function dayLabel(iso: string): string {
  // "ma 14 sep" — short enough for a 7-column strip on a phone.
  const [, m, d] = iso.split("-").map(Number);
  const names = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const months = [
    "jan", "feb", "mrt", "apr", "mei", "jun",
    "jul", "aug", "sep", "okt", "nov", "dec",
  ];
  const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return `${names[weekday]} ${d} ${months[m - 1]}`;
}

/** How long a task has been sitting, for the many that carry no deadline.
 *  "al 3 dagen open" is the honest answer to "what is he doing about it". */
function ageLabel(createdAt: Date, now: Date): string {
  const days = Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000);
  if (days <= 0) return "net toegevoegd";
  if (days === 1) return "al 1 dag open";
  return `al ${days} dagen open`;
}

/** Where a task sits relative to today, in words rather than a date the client
 *  has to parse. YYYY-MM-DD strings compare correctly as plain strings.
 *
 *  Most tasks the client dictates have no deadline at all, so an undated one
 *  falls back to its age rather than a repeated "geen deadline" that would
 *  spend a line saying nothing. */
function dueLabel(
  dueDate: string | null,
  createdAt: Date,
  today: string,
  tomorrow: string,
  now: Date
): { text: string; overdue: boolean; dueToday: boolean } {
  if (!dueDate) {
    return { text: ageLabel(createdAt, now), overdue: false, dueToday: false };
  }
  if (dueDate < today) return { text: "Te laat", overdue: true, dueToday: false };
  if (dueDate === today) return { text: "Vandaag", overdue: false, dueToday: true };
  if (dueDate === tomorrow) return { text: "Morgen", overdue: false, dueToday: false };
  return { text: dayLabel(dueDate), overdue: false, dueToday: false };
}

/** Overdue, then due today, then anything with a deadline — and only then the
 *  undated pile, oldest-created first so nothing quietly rots at the bottom. */
function openTaskRank(t: WorkerOpenTask): 0 | 1 | 2 | 3 {
  if (t.overdue) return 0;
  if (t.dueToday) return 1;
  if (t.hasDue) return 2;
  return 3;
}

export async function canViewWorkers(userId: string, role: string): Promise<boolean> {
  // Owners keep access so the person doing the work can verify what the client
  // sees; everyone else needs the explicit flag.
  if (role === "owner") return true;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { canViewWorkers: true },
    });
    return user?.canViewWorkers === true;
  } catch {
    return false;
  }
}

/**
 * Everyone who is expected to deliver work right now: anybody with an active
 * recurring obligation, or with a task still open. Deliberately narrow —
 * a card with nothing on it is noise for the client, and a stale legacy
 * account whose tasks were all finished years ago should not appear at all.
 */
async function workerIds(): Promise<string[]> {
  const [recurring, openTasks] = await Promise.all([
    db.recurringTask.findMany({
      where: { active: true, assigneeId: { not: null } },
      select: { assigneeId: true },
    }),
    db.task.findMany({
      where: { assigneeId: { not: null }, status: { in: OPEN_STATUSES } },
      select: { assigneeId: true },
      take: 2000,
    }),
  ]);

  const ids = new Set<string>();
  for (const r of recurring) if (r.assigneeId) ids.add(r.assigneeId);
  for (const t of openTasks) if (t.assigneeId) ids.add(t.assigneeId);
  return [...ids];
}

export async function buildWorkersBoard(): Promise<WorkersBoard> {
  const now = brusselsNow();
  const historyStart = shiftISO(now.date, -(HISTORY_DAYS - 1));

  const ids = await workerIds();
  if (!ids.length) {
    return {
      date: now.date,
      dateLabel: formatISOLong(now.date),
      generatedAt: new Date().toISOString(),
      workers: [],
    };
  }

  const users = await db.user.findMany({
    where: { id: { in: ids }, status: "active" },
    select: {
      id: true,
      name: true,
      role: true,
      avatarUrl: true,
      lastSeenAt: true,
    },
  });
  // Clients are not workers, even if a task once landed on them by accident.
  const workers = users.filter((u) => u.role !== "viewer");

  if (!workers.length) {
    return {
      date: now.date,
      dateLabel: formatISOLong(now.date),
      generatedAt: new Date().toISOString(),
      workers: [],
    };
  }

  const workerIdsList = workers.map((w) => w.id);

  const [recurring, history, openRows] = await Promise.all([
    db.recurringTask.findMany({
      where: { active: true, assigneeId: { in: workerIdsList } },
      orderBy: { deadlineMinutes: "asc" },
    }),
    db.task.findMany({
      where: {
        assigneeId: { in: workerIdsList },
        OR: [
          { recurringTaskId: { not: null }, date: { gte: historyStart } },
          { date: { gte: historyStart } },
        ],
      },
      select: {
        id: true,
        status: true,
        date: true,
        assigneeId: true,
        recurringTaskId: true,
        relatedEntityType: true,
        relatedEntityId: true,
        completedAt: true,
      },
      take: 3000,
    }),
    // The open board, unfiltered by date. This is the same table the Taken
    // board edits, so a task typed there appears here on the next poll — and a
    // task with no date at all still counts, which the history query above
    // silently dropped (a NULL date never matches `date >= historyStart`).
    db.task.findMany({
      where: { assigneeId: { in: workerIdsList }, status: { in: OPEN_STATUSES } },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        date: true,
        createdAt: true,
        assigneeId: true,
        recurringTaskId: true,
      },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
      take: 500,
    }),
  ]);

  const tomorrow = shiftISO(now.date, 1);
  const builtAt = new Date();

  const summaries: WorkerSummary[] = workers.map((w) => {
    const mine = recurring.filter((r) => r.assigneeId === w.id);
    const myTasks = history.filter((t) => t.assigneeId === w.id);

    // Today: the obligation counts from the moment the recurring task applies,
    // even if the 10-minute sweep has not materialised the board row yet —
    // otherwise the client would see "0 taken" at 09:00 and think nothing is
    // planned.
    const dueToday = mine.filter((r) => r.days.includes(now.isoDay));
    const items: WorkerRecurringItem[] = dueToday.map((r) => {
      const task = myTasks.find(
        (t) => t.recurringTaskId === r.id && t.date === now.date
      );
      const deadline = formatMinutes(r.deadlineMinutes);
      // Aim at the deadline, but only the cut-off may call the day missed.
      const cutoff = effectiveCutoff(r.deadlineMinutes, r.lateUntilMinutes);
      const lateUntil = cutoff > r.deadlineMinutes ? formatMinutes(cutoff) : null;
      const done = task?.status === "done";
      const cancelled = task?.status === "cancelled";

      let state: RecurringState;
      let stateText: string;
      if (done) {
        // Whatever the hour: finished is finished, and the card says when.
        state = "done";
        stateText = task?.completedAt
          ? `Klaar om ${formatMinutes(brusselsMinutesOf(new Date(task.completedAt)))}`
          : "Klaar";
      } else if (cancelled) {
        state = "pending";
        stateText = "Vervallen";
      } else if (now.minutes > cutoff) {
        state = "missed";
        stateText = `Deadline ${deadline} gemist`;
      } else if (now.minutes > r.deadlineMinutes) {
        // Past the target, inside the working day — late, not lost.
        state = "late";
        stateText = `Te laat — telt nog tot ${formatMinutes(cutoff)}`;
      } else {
        state = "pending";
        stateText = `Nog ${r.deadlineMinutes - now.minutes} min (voor ${deadline})`;
      }

      return {
        id: r.id,
        title: r.title,
        deadline,
        lateUntil,
        state,
        stateText,
        link: task?.relatedEntityType === "blog" ? task.relatedEntityId : null,
        linkLabel: task?.relatedEntityType === "blog" ? "Bekijk de blogpost" : null,
      };
    });

    // History strip. Past days are read from the materialised rows, so a
    // recurring task created this morning never shows up as "missed" for the
    // six days before it existed.
    const days: WorkerDay[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i -= 1) {
      const date = shiftISO(now.date, -i);
      const isoDay = isoDayOf(date);
      const expected = mine.filter((r) => r.days.includes(isoDay));
      const rows = myTasks.filter(
        (t) => t.date === date && t.recurringTaskId && t.status !== "cancelled"
      );
      const done = rows.filter((t) => t.status === "done").length;
      // Prefer what actually exists on the board; fall back to the schedule for
      // today, where the sweep may not have run yet.
      const total = rows.length > 0 ? rows.length : date === now.date ? expected.length : 0;

      let outcome: WorkerDay["outcome"];
      if (total === 0) outcome = "none";
      else if (done === total) outcome = "done";
      else if (done > 0) outcome = "partial";
      else if (date === now.date) outcome = "future";
      else outcome = "missed";

      days.push({
        date,
        label: dayLabel(date),
        isToday: date === now.date,
        done,
        total,
        outcome,
      });
    }

    // A recurring rule due today is already rendered above; repeating its
    // materialised row here would show the client the same obligation twice.
    const adHoc = openRows.filter(
      (t) => t.assigneeId === w.id && !(t.recurringTaskId && t.date === now.date)
    );
    const openTaskList: WorkerOpenTask[] = adHoc
      .map((t) => {
        const dueDate = t.dueDate ?? t.date ?? null;
        const due = dueLabel(dueDate, t.createdAt, now.date, tomorrow, builtAt);
        return {
          id: t.id,
          title: t.title,
          status: t.status,
          statusLabel: statusMeta(t.status)?.label ?? t.status,
          priority: priorityMeta(t.priority).key,
          dueText: due.text,
          overdue: due.overdue,
          dueToday: due.dueToday,
          hasDue: dueDate !== null,
          createdAt: t.createdAt.toISOString(),
        };
      })
      .sort((a, b) => {
        // Compared rather than subtracted: TypeScript collapses the difference
        // of two `0 | 1 | 2 | 3` values to a single literal and then rejects the
        // `=== 3` below as impossible.
        const ra = openTaskRank(a);
        const rb = openTaskRank(b);
        if (ra !== rb) return ra < rb ? -1 : 1;
        // Every dated row is ordered by urgency, but inside the undated pile
        // "urgent" would only echo the priority badge — the age is the thing
        // that is otherwise invisible, so the one sitting longest leads.
        if (ra === 3) return a.createdAt.localeCompare(b.createdAt);
        return priorityMeta(b.priority).weight - priorityMeta(a.priority).weight;
      });

    const todayRow = days[days.length - 1];
    const lastSeenAt = w.lastSeenAt?.toISOString() ?? null;
    const online =
      !!w.lastSeenAt && Date.now() - w.lastSeenAt.getTime() < ONLINE_WINDOW_MS;

    return {
      id: w.id,
      name: w.name,
      role: w.role,
      avatarUrl: w.avatarUrl,
      online,
      lastSeenAt,
      lastSeenText: online ? "nu online" : relativeTime(lastSeenAt),
      todayDone: todayRow?.done ?? 0,
      todayTotal: todayRow?.total ?? 0,
      openTasks: adHoc.length,
      openTaskList: openTaskList.slice(0, OPEN_TASK_LIMIT),
      recurring: items,
      history: days,
    };
  });

  return {
    date: now.date,
    dateLabel: formatISOLong(now.date),
    generatedAt: new Date().toISOString(),
    // A card with nothing on it reads as "this person did nothing", which is
    // worse than no card. Only show someone with something to show: a recurring
    // obligation, work on the board, or a finished obligation today.
    workers: summaries.filter(
      (s) => s.recurring.length > 0 || s.openTasks > 0 || s.todayTotal > 0
    ),
  };
}
