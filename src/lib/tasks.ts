// Canonical task vocabulary.
//
// These values previously lived in three places that disagreed: the Prisma
// schema defaulted priority to "normal", the create dialog defaulted it to
// "medium", and the board's colour map only knew "medium". The result was that
// every task created through the UI carried a value the schema never used and
// rendered with an unstyled badge. Everything now reads from here.

export const TASK_STATUSES = [
  { key: "backlog", label: "Backlog", hint: "Ideeën en later" },
  { key: "todo", label: "Te Doen", hint: "Klaar om op te pakken" },
  { key: "in_progress", label: "Bezig", hint: "Wordt aan gewerkt" },
  { key: "waiting", label: "Wacht", hint: "Wacht op iemand of iets" },
  { key: "done", label: "Klaar", hint: "Afgerond" },
  { key: "cancelled", label: "Geannuleerd", hint: "Niet doorgegaan" },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["key"];

/** Columns rendered by default — the closed ones are hidden behind a toggle. */
export const OPEN_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "waiting"];
export const CLOSED_STATUSES: TaskStatus[] = ["done", "cancelled"];

export const TASK_PRIORITIES = [
  { key: "low", label: "Laag", weight: 0 },
  { key: "normal", label: "Normaal", weight: 1 },
  { key: "high", label: "Hoog", weight: 2 },
  { key: "urgent", label: "Urgent", weight: 3 },
] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number]["key"];

export const TASK_CATEGORIES = [
  "algemeen",
  "blog",
  "producten",
  "bestellingen",
  "marketing",
  "technisch",
] as const;

export const STATUS_KEYS = TASK_STATUSES.map((s) => s.key) as string[];
export const PRIORITY_KEYS = TASK_PRIORITIES.map((p) => p.key) as string[];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && STATUS_KEYS.includes(value);
}

/**
 * Accepts the legacy "medium" spelling as well as the canonical values, so a
 * stale client or an old row can never produce an unstyled badge.
 */
export function normalizePriority(value: unknown): TaskPriority {
  if (value === "medium") return "normal";
  return isPriorityKey(value) ? value : "normal";
}

function isPriorityKey(value: unknown): value is TaskPriority {
  return typeof value === "string" && PRIORITY_KEYS.includes(value);
}

export function statusMeta(key: string) {
  return TASK_STATUSES.find((s) => s.key === key) ?? null;
}

export function priorityMeta(key: string) {
  return TASK_PRIORITIES.find((p) => p.key === normalizePriority(key))!;
}

export function isClosedStatus(key: string): boolean {
  return (CLOSED_STATUSES as string[]).includes(key);
}

/** Tailwind classes per status, kept in one place so board and list agree. */
export const STATUS_STYLE: Record<string, string> = {
  backlog: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  todo: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  waiting: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

/** Tint for the column container — deliberately softer than the badge. */
export const STATUS_COLUMN_STYLE: Record<string, string> = {
  backlog: "border-slate-500/20 bg-slate-500/[0.03]",
  todo: "border-sky-500/20 bg-sky-500/[0.03]",
  in_progress: "border-blue-500/20 bg-blue-500/[0.03]",
  waiting: "border-amber-500/20 bg-amber-500/[0.03]",
  done: "border-emerald-500/20 bg-emerald-500/[0.03]",
  cancelled: "border-zinc-500/20 bg-zinc-500/[0.03]",
};

export const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  normal: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  urgent: "bg-red-500/10 text-red-400 border-red-500/20",
};

/** Sentinel for "no selection" in Selects — base-ui treats "" as no value. */
export const NONE = "__none__";

// ─── Wire shape ───
// The single-task endpoint used to hand back raw Prisma rows (comments as
// `text`, subtasks as a `completed` boolean) while the list endpoint sent the
// mapped shape (`content`, `status`). The UI only understands the latter, so
// refreshing a task after commenting blanked every comment and unticked every
// subtask. Both endpoints now go through one serializer.

export interface TaskUser {
  id: string;
  name: string;
  username: string;
}

export interface SubTask {
  id: string;
  title: string;
  status: string;
  order: number;
}

export interface TaskComment {
  id: string;
  content: string;
  author: { id: string; name: string } | null;
  createdAt: string;
}

export interface TimeLog {
  start: string;
  end?: string;
  duration?: number;
}

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string;
  date: string;
  dueDate: string | null;
  tags: string[];
  sortOrder: number;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assignee: TaskUser | null;
  creator: TaskUser | null;
  subtasks: SubTask[];
  comments: TaskComment[];
  timeLogs: TimeLog[];
}

/** A task's due date is a plain YYYY-MM-DD string, so compare as strings. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || isClosedStatus(status)) return false;
  return dueDate < todayISO();
}

export function isDueToday(dueDate: string | null, status: string): boolean {
  if (!dueDate || isClosedStatus(status)) return false;
  return dueDate === todayISO();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("nl-BE", { day: "2-digit", month: "short" });
}

export function formatDateLong(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("nl-BE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
