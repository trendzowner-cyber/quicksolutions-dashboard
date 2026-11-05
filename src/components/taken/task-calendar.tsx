"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  PRIORITY_STYLE,
  STATUS_STYLE,
  isClosedStatus,
  priorityMeta,
  todayISO,
  type TaskData,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const MAX_CHIPS = 3;

interface TaskCalendarProps {
  tasks: TaskData[];
  onOpen: (task: TaskData) => void;
  onAddOnDate: (iso: string) => void;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function TaskCalendar({ tasks, onOpen, onAddOnDate }: TaskCalendarProps) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const today = todayISO();

  const byDate = useMemo(() => {
    const map = new Map<string, TaskData[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate);
      if (list) list.push(t);
      else map.set(t.dueDate, [t]);
    }
    // Highest priority first inside a day, closed items last.
    for (const list of map.values()) {
      list.sort((a, b) => {
        const closed = Number(isClosedStatus(a.status)) - Number(isClosedStatus(b.status));
        if (closed !== 0) return closed;
        return priorityMeta(b.priority).weight - priorityMeta(a.priority).weight;
      });
    }
    return map;
  }, [tasks]);

  const undated = tasks.filter((t) => !t.dueDate && !isClosedStatus(t.status));

  const { year, month } = cursor;
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(year, month, 1).toLocaleDateString("nl-BE", {
    month: "long",
    year: "numeric",
  });

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold capitalize">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Vorige maand" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
          >
            Vandaag
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Volgende maand" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`pad-${i}`} className="min-h-24 rounded-lg" />;

              const dateISO = iso(year, month, day);
              const dayTasks = byDate.get(dateISO) ?? [];
              const isToday = dateISO === today;
              const hidden = dayTasks.length - MAX_CHIPS;

              return (
                <div
                  key={dateISO}
                  className={cn(
                    "group/day min-h-24 rounded-lg border border-border/60 p-1.5 transition-colors hover:border-foreground/20",
                    isToday && "border-primary/50 bg-primary/[0.04]"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                        isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
                      )}
                    >
                      {day}
                    </span>
                    <button
                      type="button"
                      aria-label={`Taak toevoegen op ${dateISO}`}
                      onClick={() => onAddOnDate(dateISO)}
                      className="text-xs leading-none text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/day:opacity-100"
                    >
                      +
                    </button>
                  </div>

                  <div className="space-y-0.5">
                    {dayTasks.slice(0, MAX_CHIPS).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpen(t)}
                        title={t.title}
                        className={cn(
                          "flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left text-[10px] leading-tight",
                          STATUS_STYLE[t.status],
                          isClosedStatus(t.status) && "line-through opacity-60"
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full border",
                            PRIORITY_STYLE[priorityMeta(t.priority).key]
                          )}
                        />
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                    {hidden > 0 && (
                      <p className="pl-1 text-[10px] text-muted-foreground">+{hidden} meer</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-lg border border-border/60 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Zonder deadline ({undated.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {undated.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px]",
                  STATUS_STYLE[t.status]
                )}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
