import type { WorkerSummary } from "@/lib/workers";

// The one place that decides what a person's day amounts to.
//
// It lives apart from the card because the summary at the top of the screen
// adds these up — if the card and the summary each did their own arithmetic
// they would eventually disagree, and the client would be looking at "8 van 10
// klaar" above a list of people who are all finished. One function, two
// readers, no drift.

export interface WorkerFocus {
  title: string;
  /** "Te laat", "Vandaag", "Deadline 15:00 gemist" — whatever explains it. */
  timing: string;
}

export interface WorkerCounts {
  /** Everything still to do today: recurring that is not done, plus open board work. */
  remaining: number;
  /** Anything past its deadline — the only number that turns the screen red. */
  late: number;
  allDone: boolean;
  /** One short Dutch sentence, already pluralised. */
  status: string;
  /** The single item worth naming: whatever is furthest behind. */
  focus: WorkerFocus | null;
  percent: number;
  tone: "done" | "late" | "pending";
}

export function workerCounts(worker: WorkerSummary): WorkerCounts {
  const todayRemaining = Math.max(0, worker.todayTotal - worker.todayDone);
  const remaining = todayRemaining + worker.openTasks;

  const missed = worker.recurring.find((r) => r.state === "missed");
  const lateRecurring = worker.recurring.filter((r) => r.state === "late");
  const overdueTask = worker.openTaskList.find((t) => t.overdue);

  const late = lateRecurring.length + (missed ? 1 : 0) + (overdueTask ? 1 : 0);
  const allDone = remaining === 0;

  // Ordered by how badly it is going: a missed obligation first, then an
  // overdue board task, then a recurring item running late, then the next thing
  // due, then anything open at all.
  const pendingRecurring = worker.recurring.find((r) => r.state === "pending");
  const focus: WorkerFocus | null = missed
    ? { title: missed.title, timing: missed.stateText }
    : overdueTask
      ? { title: overdueTask.title, timing: overdueTask.dueText }
      : lateRecurring[0]
        ? { title: lateRecurring[0].title, timing: lateRecurring[0].stateText }
        : pendingRecurring
          ? { title: pendingRecurring.title, timing: pendingRecurring.stateText }
          : worker.openTaskList[0]
            ? {
                title: worker.openTaskList[0].title,
                timing: worker.openTaskList[0].dueText,
              }
            : null;

  const tone: WorkerCounts["tone"] =
    late > 0 ? "late" : allDone ? "done" : "pending";

  const status =
    late > 0
      ? `${late} te laat`
      : allDone
        ? "Alles klaar"
        : `Nog ${remaining} te doen`;

  return {
    remaining,
    late,
    allDone,
    status,
    focus,
    tone,
    percent:
      worker.todayTotal > 0
        ? Math.min(100, Math.round((worker.todayDone / worker.todayTotal) * 100))
        : allDone
          ? 100
          : 0,
  };
}
