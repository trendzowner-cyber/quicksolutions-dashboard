"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Plus,
  UserRound,
} from "lucide-react";
import type { WorkerRecurringItem, WorkerSummary } from "@/lib/workers";
import { TaskComposerForm } from "./task-composer-form";

// Everything the card left out, one tap away.
//
// The list is deliberately short and the words are the client's, not the
// board's: what was he supposed to do today, did it happen, what else is open,
// and how did the last week go. No priority, no category, no sort order — none
// of it changes a single decision he makes from this screen.
//
// "Taak geven" swaps this content for the composer rather than opening a second
// sheet on top: nested base-ui dialogs fight over focus and the escape key, and
// the client should never be looking at two stacked panels on a phone.

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const STATE_STYLE = {
  done: { icon: CheckCircle2, className: "text-emerald-400" },
  late: { icon: Clock, className: "text-amber-400" },
  missed: { icon: AlertTriangle, className: "text-rose-400" },
  pending: { icon: Clock, className: "text-muted-foreground" },
} as const;

const DAY_TONE = {
  done: "bg-emerald-500/15 text-emerald-400",
  partial: "bg-amber-500/15 text-amber-400",
  missed: "bg-rose-500/15 text-rose-400",
  future: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
} as const;

function RecurringRow({ item }: { item: WorkerRecurringItem }) {
  const { icon: Icon, className } = STATE_STYLE[item.state];
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", className)} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium leading-snug">{item.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{item.stateText}</p>
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-brand"
            >
              {item.linkLabel ?? "Bekijken"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export function WorkerDetailsSheet({
  worker,
  open,
  onOpenChange,
  onChanged,
}: {
  /** Null while closed — the sheet stays mounted so it can animate out. */
  worker: WorkerSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [view, setView] = useState<"details" | "compose">("details");

  if (!worker) return null;

  const hiddenTasks = Math.max(0, worker.openTasks - worker.openTaskList.length);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "client-ui",
          // Composing takes the whole screen, exactly as it does from the
          // "+ Nieuwe taak" button. Asking for a task in two different-looking
          // containers depending on which button he pressed is the kind of
          // inconsistency that reads as unfinished, and the form is the same
          // form either way.
          view === "compose"
            ? "gap-0 overflow-hidden data-[side=bottom]:h-dvh"
            : "max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        )}
      >
        {view === "compose" ? (
          <>
            {/* The composer draws its own header; this only gives the dialog
                its accessible name. */}
            <SheetTitle className="sr-only">Taak voor {worker.name}</SheetTitle>
            <TaskComposerForm
              heading={`Taak voor ${worker.name}`}
              back
              presetAssigneeId={worker.id}
              onSaved={() => {
                setView("details");
                onChanged();
              }}
              onCancel={() => setView("details")}
            />
          </>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3 pr-8">
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
                <div className="min-w-0">
                  <SheetTitle className="truncate text-xl">
                    {worker.name}
                  </SheetTitle>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 shrink-0 rounded-full",
                        worker.online ? "bg-emerald-500" : "bg-muted-foreground/40"
                      )}
                    />
                    {worker.online ? "Nu online" : worker.lastSeenText}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 px-4">
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Vandaag nog te doen
                </h3>

                {worker.recurring.length === 0 && worker.openTaskList.length === 0 && (
                  <p className="rounded-xl bg-muted/50 px-3 py-3 text-base text-muted-foreground">
                    Er staat vandaag niets open.
                  </p>
                )}

                {worker.recurring.length > 0 && (
                  <ul className="space-y-2">
                    {worker.recurring.map((item) => (
                      <RecurringRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}

                {worker.openTaskList.length > 0 && (
                  <ul className="space-y-2">
                    {worker.openTaskList.map((task) => (
                      // Links into the existing task board with the row already
                      // open, so this view never has to rebuild an editor.
                      <li key={task.id}>
                        <a
                          href={`/dashboard/taken?task=${task.id}`}
                          className="flex items-center gap-2 rounded-xl border border-border p-3 active:bg-muted/40"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-medium leading-snug">
                              {task.title}
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 text-sm",
                                task.overdue
                                  ? "text-rose-400"
                                  : "text-muted-foreground"
                              )}
                            >
                              {task.dueText}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                {hiddenTasks > 0 && (
                  <a
                    href="/dashboard/taken"
                    className="block text-sm font-medium text-brand"
                  >
                    Nog {hiddenTasks} {hiddenTasks === 1 ? "taak" : "taken"}{" "}
                    bekijken
                  </a>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Laatste 7 dagen
                </h3>
                <div className="flex gap-1.5">
                  {worker.history.map((day) => (
                    <div
                      key={day.date}
                      className="flex-1 text-center"
                      title={`${day.label}: ${day.done}/${day.total}`}
                    >
                      <div
                        className={cn(
                          "flex h-12 items-center justify-center rounded-lg text-sm font-semibold tabular-nums",
                          DAY_TONE[day.outcome]
                        )}
                      >
                        {day.total > 0 ? `${day.done}/${day.total}` : "—"}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {day.isToday ? "vandaag" : day.label.split(" ")[0]}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <Button
                onClick={() => setView("compose")}
                className="h-12 w-full text-base"
              >
                <Plus className="h-5 w-5" />
                Taak geven
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
