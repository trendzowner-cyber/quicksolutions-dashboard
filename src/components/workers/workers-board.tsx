"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  Repeat,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RecurringDialog } from "@/components/taken/recurring-dialog";
import { AssignTaskDialog } from "./assign-task-dialog";
import type { TaskUser } from "@/lib/tasks";

// The client-facing board: one card per worker, nothing to click except the
// links that matter. Phone first — Azedine opens this standing in a shop, so
// the answer ("did he do it today") has to be readable without scrolling or
// zooming.

type RecurringState = "done" | "late" | "missed" | "pending";

interface WorkerRecurringItem {
  id: string;
  title: string;
  deadline: string;
  /** End-of-day cut-off ("18:00") when the obligation has one, else null. */
  lateUntil: string | null;
  state: RecurringState;
  stateText: string;
  link: string | null;
  linkLabel: string | null;
}

interface WorkerDay {
  date: string;
  label: string;
  isToday: boolean;
  done: number;
  total: number;
  outcome: "done" | "partial" | "missed" | "none" | "future";
}

interface WorkerOpenTask {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  priority: string;
  /** A deadline in words, or the age when there is no deadline at all. */
  dueText: string;
  overdue: boolean;
  dueToday: boolean;
  hasDue: boolean;
  createdAt: string;
}

interface WorkerSummary {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  online: boolean;
  lastSeenText: string;
  todayDone: number;
  todayTotal: number;
  openTasks: number;
  openTaskList: WorkerOpenTask[];
  recurring: WorkerRecurringItem[];
  history: WorkerDay[];
}

interface WorkersBoardData {
  date: string;
  dateLabel: string;
  generatedAt: string;
  workers: WorkerSummary[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  marketer: "Marketeer",
  content_manager: "Content Manager",
  sales: "Sales",
  analyst: "Analist",
  viewer: "Viewer",
};

const STATE_STYLE: Record<
  RecurringState,
  { icon: typeof CheckCircle2; className: string; ring: string }
> = {
  done: {
    icon: CheckCircle2,
    className: "text-emerald-400",
    ring: "bg-emerald-500/10 ring-emerald-500/20",
  },
  pending: {
    icon: Clock,
    className: "text-amber-400",
    ring: "bg-amber-500/10 ring-amber-500/20",
  },
  late: {
    icon: Clock,
    className: "text-amber-400",
    ring: "bg-amber-500/10 ring-amber-500/20",
  },
  missed: {
    icon: AlertTriangle,
    className: "text-rose-400",
    ring: "bg-rose-500/10 ring-rose-500/20",
  },
};

/** A dot, not a badge — priority matters here only as a glance-ordering. */
const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400/60",
  normal: "bg-blue-400",
  high: "bg-amber-400",
  urgent: "bg-red-400",
};

const BAR_STYLE: Record<WorkerDay["outcome"], string> = {
  done: "bg-emerald-500/80",
  partial: "bg-amber-500/80",
  missed: "bg-rose-500/70",
  none: "bg-muted",
  future: "bg-muted",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function updatedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "zojuist bijgewerkt";
  return `${mins} min geleden bijgewerkt`;
}

function WorkerCard({
  worker,
  onRequestTask,
}: {
  worker: WorkerSummary;
  onRequestTask: (worker: WorkerSummary) => void;
}) {
  const percent =
    worker.todayTotal > 0
      ? Math.round((worker.todayDone / worker.todayTotal) * 100)
      : 0;
  const allDone = worker.todayTotal > 0 && worker.todayDone === worker.todayTotal;

  return (
    <Card className="gap-3 p-4">
      {/* Identity + presence */}
      <div className="flex items-center gap-3">
        {worker.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={worker.avatarUrl}
            alt={worker.name}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
            {initials(worker.name) || <UserRound className="h-5 w-5" />}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{worker.name}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[worker.role] ?? worker.role}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              worker.online ? "bg-emerald-400" : "bg-muted-foreground/40"
            )}
          />
          <span
            className={cn(
              "text-xs",
              worker.online ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {worker.online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Today at a glance */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Vandaag</span>
          <span
            className={cn(
              "text-xs font-medium",
              allDone ? "text-emerald-400" : "text-foreground"
            )}
          >
            {worker.todayTotal > 0
              ? `${worker.todayDone} van ${worker.todayTotal} klaar`
              : worker.openTasks > 0
                ? `${worker.openTasks} open`
                : "Geen taken vandaag"}
          </span>
        </div>
        {worker.todayTotal > 0 && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                allDone ? "bg-emerald-500" : "bg-brand"
              )}
              style={{ width: `${Math.max(percent, 3)}%` }}
            />
          </div>
        )}
      </div>

      {/* Today's obligations */}
      {worker.recurring.length > 0 && (
        <div className="space-y-2">
          {worker.recurring.map((item) => {
            const style = STATE_STYLE[item.state];
            const Icon = style.icon;
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-lg p-3 ring-1 ring-inset",
                  style.ring
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    <p className={cn("text-xs", style.className)}>{item.stateText}</p>
                  </div>
                </div>

                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {item.linkLabel ?? "Bekijk resultaat"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* What he is actually working on, not just how much. These are the same
          Task rows the Taken board edits — one table, so ticking a task there
          is reflected here on the next refresh. */}
      {worker.openTaskList.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">
            Op het bord
            {worker.openTasks > worker.openTaskList.length &&
              ` (${worker.openTaskList.length} van ${worker.openTasks})`}
          </p>
          <div className="space-y-0.5">
            {worker.openTaskList.map((task) => (
              <a
                key={task.id}
                href={`/dashboard/taken?task=${task.id}`}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <span
                  className={cn(
                    "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                    PRIORITY_DOT[task.priority] ?? "bg-muted-foreground/40"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium leading-snug">
                    {task.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {task.statusLabel} ·{" "}
                    <span
                      className={cn(
                        task.overdue && "font-medium text-rose-400",
                        task.dueToday && "font-medium text-amber-400"
                      )}
                    >
                      {task.dueText}
                    </span>
                  </span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Last seven days — the pattern is what the client is really buying */}
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Laatste 7 dagen</p>
        <div className="flex items-end gap-1.5">
          {worker.history.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  "h-8 w-full rounded-md",
                  BAR_STYLE[day.outcome],
                  day.isToday && "ring-1 ring-foreground/30"
                )}
                title={`${day.label}: ${day.done}/${day.total}`}
              />
              <span
                className={cn(
                  "text-[10px] leading-none",
                  day.isToday ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {day.label.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Handing over work without leaving this screen — the client's own way
          in, and the shortest path for Kerim too. */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 text-xs text-muted-foreground"
        onClick={() => onRequestTask(worker)}
      >
        <Plus className="h-3.5 w-3.5" />
        Taak voor {worker.name.split(" ")[0]}
      </Button>
    </Card>
  );
}

export function WorkersBoard({
  initial,
  canManage,
}: {
  initial: WorkersBoardData;
  /** owner/admin: may edit the recurring rules everyone is measured against. */
  canManage: boolean;
}) {
  const [data, setData] = useState<WorkersBoardData>(initial);
  const [busy, setBusy] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [requestWorker, setRequestWorker] = useState<WorkerSummary | null>(null);

  // Only needed when the dialog opens, and only for the managers who can.
  const openRecurring = useCallback(async () => {
    if (!users.length) {
      try {
        const res = await fetch("/api/users?scope=assignable", { cache: "no-store" });
        if (res.ok) setUsers(((await res.json()) as { users?: TaskUser[] }).users ?? []);
      } catch {
        // the dialog still opens; the assignee picker just stays empty
      }
    }
    setRecurringOpen(true);
  }, [users.length]);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/workers", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as WorkersBoardData);
    } catch {
      // Keep showing the last good board rather than an empty screen.
    } finally {
      setBusy(false);
    }
  }, []);

  // Presence and task completion both move on their own — keep the board
  // honest without making the client pull to refresh.
  useEffect(() => {
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Workers</h1>
          <p className="text-xs text-muted-foreground capitalize">{data.dateLabel}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={refresh}
          disabled={busy}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          {updatedAgo(data.generatedAt)}
        </Button>
      </div>

      {/* The board Kerim is judged on is also the place he should be able to
          change the rules — otherwise "add a daily" means finding another page. */}
      {canManage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={openRecurring}
        >
          <Repeat className="h-3.5 w-3.5" />
          Dagelijkse taken beheren
        </Button>
      )}

      {data.workers.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nog geen workers met taken.
        </Card>
      ) : (
        data.workers.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} onRequestTask={setRequestWorker} />
        ))
      )}

      {canManage && (
        <RecurringDialog
          open={recurringOpen}
          onOpenChange={setRecurringOpen}
          users={users}
        />
      )}

      <AssignTaskDialog
        open={requestWorker !== null}
        onOpenChange={(open) => {
          if (!open) setRequestWorker(null);
        }}
        worker={requestWorker}
        onCreated={refresh}
      />
    </div>
  );
}
