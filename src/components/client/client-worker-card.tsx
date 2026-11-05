"use client";

import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkerSummary } from "@/lib/workers";
import { workerCounts } from "./worker-counts";

// One person, one line, one tap.
//
// What is deliberately not here: the role label (the client does not think of
// his team as "content_manager"), the priority dots, the seven-day strip, the
// six open tasks, and every "Bezig / Te doen / Wacht" status word. All of that
// is behind the tap — this is the folded version, and it has exactly one job:
// is this person on track today or not.
//
// Colour alone never carries the message: green says "Alles klaar", amber says
// how many are left and names the first one.

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const TONE = {
  done: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  late: { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  pending: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
} as const;

export function ClientWorkerCard({
  worker,
  onOpen,
}: {
  worker: WorkerSummary;
  onOpen: () => void;
}) {
  const { status, focus, allDone, percent, tone } = workerCounts(worker);
  const colors = TONE[tone];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors active:bg-muted/40"
    >
      <div className="flex items-center gap-3">
        {worker.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={worker.avatarUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-base font-semibold text-brand">
            {initials(worker.name) || <UserRound className="h-5 w-5" />}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">
            {worker.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full",
                worker.online ? "bg-emerald-500" : "bg-muted-foreground/40"
              )}
            />
            <span className="truncate">
              {worker.online ? "Nu online" : worker.lastSeenText}
            </span>
          </p>
        </div>

        <p className={cn("shrink-0 text-base font-medium", colors.text)}>
          {status}
        </p>
      </div>

      {worker.todayTotal > 0 && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", colors.bar)}
            // A sliver of colour even at the first of ten, so the bar reads as
            // a bar rather than as a missing element.
            style={{ width: `${Math.max(percent, worker.todayDone > 0 ? 3 : 0)}%` }}
          />
        </div>
      )}

      {focus && !allDone && (
        <p className="mt-2 truncate text-sm text-muted-foreground">
          {focus.title}
          <span className="text-muted-foreground/70"> · {focus.timing}</span>
        </p>
      )}
    </button>
  );
}
