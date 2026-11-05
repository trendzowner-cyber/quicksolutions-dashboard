"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkersBoard, WorkerSummary } from "@/lib/workers";
import { workerCounts } from "./worker-counts";
import { TodaySummary } from "./today-summary";
import { ClientWorkerCard } from "./client-worker-card";
import { WorkerDetailsSheet } from "./worker-details-sheet";
import { TaskComposerSheet } from "./task-composer-sheet";

// The screen the client opens. One answer at the top, one line per person
// underneath, one button to hand out work.
//
// The numbers come from /api/workers — the same endpoint the operator's worker
// board uses, so the two can never tell different stories. A 403 there means
// this account has no worker access at all; that is a state, not an error, and
// it gets a sentence rather than a red toast.

const POLL_MS = 60_000;

type LoadState = "loading" | "ready" | "no-access" | "failed";

export function ClientToday() {
  const [board, setBoard] = useState<WorkersBoard | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [selected, setSelected] = useState<WorkerSummary | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workers", { cache: "no-store" });
      if (res.status === 403) {
        setState("no-access");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as WorkersBoard;
      setBoard(data);
      setState("ready");
    } catch {
      setState((prev) => (prev === "ready" ? "ready" : "failed"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await load();
    };
    void run();

    const timer = setInterval(() => void run(), POLL_MS);
    // A phone that has been in a pocket for two hours should not show two-hour
    // old numbers when it comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const workers = useMemo(() => board?.workers ?? [], [board]);

  // The headline numbers are the sum of the cards, computed by the same
  // function the cards use — "8 van 10" can never contradict the list below it.
  const totals = useMemo(() => {
    let done = 0;
    let remaining = 0;
    let late = 0;
    for (const w of workers) {
      const counts = workerCounts(w);
      done += w.todayDone;
      remaining += counts.remaining;
      late += counts.late;
    }
    return { done, total: done + remaining, late };
  }, [workers]);

  const manualRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openWorker = (worker: WorkerSummary) => {
    setSelected(worker);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-4">
      <TodaySummary
        done={totals.done}
        total={totals.total}
        late={totals.late}
        loading={state === "loading"}
      />

      {state === "no-access" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-base text-muted-foreground">
            Je hebt nog geen toegang tot het teamoverzicht. Laat dit instellen
            door QuickSolutions.
          </p>
        </section>
      )}

      {state === "failed" && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-base text-muted-foreground">
            De gegevens konden niet geladen worden.
          </p>
          <Button
            variant="outline"
            onClick={manualRefresh}
            disabled={refreshing}
            className="mt-3 h-11"
          >
            <RefreshCw className="h-4 w-4" />
            Opnieuw proberen
          </Button>
        </section>
      )}

      {state === "ready" && workers.length === 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-base text-muted-foreground">
            Er staat vandaag geen werk gepland voor het team.
          </p>
        </section>
      )}

      {workers.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">
            Team vandaag
          </h2>
          {workers.map((worker) => (
            <ClientWorkerCard
              key={worker.id}
              worker={worker}
              onOpen={() => openWorker(worker)}
            />
          ))}
        </section>
      )}

      {/* Above the bottom nav, aligned to the same centred column as the
          content. The wrapper is transparent to taps so it never swallows a
          card underneath; only the button itself is clickable. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30"
        style={{
          bottom: "calc(4rem + env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        <div className="mx-auto flex w-full max-w-lg justify-end px-4">
          <Button
            onClick={() => setComposerOpen(true)}
            className="pointer-events-auto h-14 rounded-full px-5 text-base shadow-lg"
          >
            <Plus className="h-5 w-5" />
            Nieuwe taak
          </Button>
        </div>
      </div>

      <TaskComposerSheet
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onSaved={() => {
          setComposerOpen(false);
          void load();
        }}
      />

      <WorkerDetailsSheet
        // Remounting on a different person is what resets the sheet's internal
        // view back to "details" — cheaper and less error-prone than an effect
        // that watches the id.
        key={selected?.id ?? "none"}
        worker={selected}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onChanged={() => void load()}
      />
    </div>
  );
}
