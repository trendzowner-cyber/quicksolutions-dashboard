"use client";

import { cn } from "@/lib/utils";

// The one card the client actually opens the app for: are we done today?
//
// Big number, one bar, one sentence. No KPI grid, no percentages to interpret,
// no chart — the answer is meant to land before he has finished unlocking the
// phone.

export function TodaySummary({
  done,
  total,
  late,
  loading,
}: {
  done: number;
  /** Everything that was supposed to happen today, including work still open. */
  total: number;
  /** Items past their deadline. Anything above zero turns the bar red. */
  late: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="animate-pulse rounded-2xl border border-border bg-card p-5">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="mt-3 h-10 w-40 rounded bg-muted" />
        <div className="mt-4 h-2.5 w-full rounded-full bg-muted" />
        <div className="mt-3 h-5 w-48 rounded bg-muted" />
      </section>
    );
  }

  // Nothing was planned. "0 van 0 — alles klaar" would be technically true and
  // completely useless, so it says the honest thing instead.
  if (total === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">Vandaag</p>
        <p className="mt-1 text-2xl font-semibold">Rustige dag</p>
        <p className="mt-1 text-base text-muted-foreground">
          Er staat vandaag niets gepland.
        </p>
      </section>
    );
  }

  const remaining = Math.max(0, total - done);
  const allDone = remaining === 0;
  const percent = Math.min(100, Math.round((done / total) * 100));

  const tone = allDone
    ? { bar: "bg-emerald-500", text: "text-emerald-400" }
    : late > 0
      ? { bar: "bg-rose-500", text: "text-rose-400" }
      : { bar: "bg-amber-500", text: "text-amber-400" };

  const status = allDone
    ? "Alles klaar voor vandaag"
    : late > 0
      ? `${late} ${late === 1 ? "taak is" : "taken zijn"} te laat`
      : `Nog ${remaining} ${remaining === 1 ? "taak" : "taken"} te doen`;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm font-medium text-muted-foreground">Vandaag</p>

      <div className="mt-1 flex items-end gap-2">
        <span className="text-4xl font-semibold leading-none tabular-nums">
          {done}
        </span>
        <span className="pb-0.5 text-lg text-muted-foreground">
          van {total} klaar
        </span>
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone.bar)}
          // A sliver of colour even at zero, so the bar reads as a bar rather
          // than as a missing element.
          style={{ width: `${Math.max(percent, done > 0 ? 3 : 0)}%` }}
        />
      </div>

      <p className={cn("mt-3 text-lg font-medium", tone.text)}>{status}</p>
    </section>
  );
}
