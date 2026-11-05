"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  TaskAssigneeSelect,
  TaskCategorySelect,
  TaskPrioritySelect,
} from "./task-selects";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import {
  ALL_DAYS,
  DAY_LABELS,
  describeDays,
  formatMinutes,
  parseTimeToMinutes,
} from "@/lib/recurring";
import { NONE, type TaskUser } from "@/lib/tasks";
import { cn } from "@/lib/utils";

// Recurring obligations ("elke werkdag de blogpost voor 15:00").
//
// These never appear on the board as such — a cron sweep materialises a real
// Task row each due day, so this dialog only owns the *rule*. That keeps the
// board, the assignee and the done-checkbox working exactly as they already do.

export interface RecurringRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  deadlineMinutes: number;
  /** End-of-day cut-off; null when the deadline itself is the cut-off. */
  lateUntilMinutes: number | null;
  days: number[];
  remindBeforeMinutes: number;
  assigneeId: string | null;
  active: boolean;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Onbekende fout");
  return data as T;
}

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "algemeen",
  priority: "normal",
  days: [1, 2, 3, 4, 5] as number[],
  time: "15:00",
  // Empty = the deadline is the cut-off. Left off by default so an obligation
  // that is genuinely a hard deadline ("check the dashboard before 10:00")
  // keeps meaning what it says; switch it on per task where the working day
  // is the real horizon.
  lateUntil: "",
  remindBeforeMinutes: 30,
  assigneeId: NONE,
};

function DayChips({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  const toggle = (day: number) => {
    onChange(
      value.includes(day)
        ? value.filter((d) => d !== day)
        : [...value, day].sort((a, b) => a - b)
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_DAYS.map((day) => {
        const on = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            onClick={() => toggle(day)}
            className={cn(
              "h-8 w-9 rounded-md text-xs font-medium transition-colors",
              on
                ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
              disabled && "opacity-50"
            )}
            aria-pressed={on}
          >
            {DAY_LABELS[day - 1]}
          </button>
        );
      })}
    </div>
  );
}

export function RecurringDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: TaskUser[];
}) {
  const [rows, setRows] = useState<RecurringRow[] | null>(null);
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ recurringTasks: RecurringRow[] }>("/api/recurring-tasks");
      setRows(data.recurringTasks);
    } catch {
      setRows([]);
      toast.error("Terugkerende taken ophalen mislukt");
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const startEdit = (row: RecurringRow) => {
    setEditing(row);
    setForm({
      title: row.title,
      description: row.description ?? "",
      category: row.category,
      priority: row.priority,
      days: row.days,
      time: formatMinutes(row.deadlineMinutes),
      lateUntil: row.lateUntilMinutes ? formatMinutes(row.lateUntilMinutes) : "",
      remindBeforeMinutes: row.remindBeforeMinutes,
      assigneeId: row.assigneeId ?? NONE,
    });
    setFormOpen(true);
  };

  const save = async () => {
    const deadlineMinutes = parseTimeToMinutes(form.time);
    if (!form.title.trim()) {
      toast.error("Geef de taak een titel");
      return;
    }
    if (!form.days.length) {
      toast.error("Kies minstens één dag");
      return;
    }
    if (deadlineMinutes === null) {
      toast.error("Ongeldig uur");
      return;
    }

    const lateUntilMinutes = form.lateUntil ? parseTimeToMinutes(form.lateUntil) : null;
    if (form.lateUntil && lateUntilMinutes === null) {
      toast.error("Ongeldig uur bij 'uiterlijk tot'");
      return;
    }
    if (lateUntilMinutes !== null && lateUntilMinutes <= deadlineMinutes) {
      toast.error("'Uiterlijk tot' moet na de deadline liggen");
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        days: form.days,
        deadlineMinutes,
        lateUntilMinutes,
        remindBeforeMinutes: form.remindBeforeMinutes,
        assigneeId: form.assigneeId === NONE ? null : form.assigneeId,
      };
      if (editing) {
        await api(`/api/recurring-tasks/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Terugkerende taak bijgewerkt");
      } else {
        await api("/api/recurring-tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Terugkerende taak aangemaakt");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: RecurringRow) => {
    try {
      await api(`/api/recurring-tasks/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !row.active }),
      });
      setRows((prev) =>
        prev?.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)) ?? prev
      );
    } catch {
      toast.error("Bijwerken mislukt");
    }
  };

  const remove = async (row: RecurringRow) => {
    if (!confirm(`"${row.title}" verwijderen? Al gemaakte taken blijven bestaan.`)) return;
    try {
      await api(`/api/recurring-tasks/${row.id}`, { method: "DELETE" });
      setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? prev);
      toast.success("Verwijderd");
    } catch {
      toast.error("Verwijderen mislukt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            Terugkerende taken
          </DialogTitle>
        </DialogHeader>

        {formOpen ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="recurring-title">Titel</Label>
              <Input
                id="recurring-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Blogpost plaatsen"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recurring-desc">Omschrijving</Label>
              <Textarea
                id="recurring-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optioneel"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Dagen</Label>
              <DayChips
                value={form.days}
                onChange={(days) => setForm({ ...form, days })}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                {form.days.length ? describeDays(form.days) : "geen dagen gekozen"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="recurring-time">Deadline</Label>
                <Input
                  id="recurring-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recurring-late">Uiterlijk tot</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="recurring-late"
                    type="time"
                    value={form.lateUntil}
                    onChange={(e) => setForm({ ...form, lateUntil: e.target.value })}
                  />
                  {form.lateUntil && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Wissen"
                      onClick={() => setForm({ ...form, lateUntil: "" })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recurring-remind">Herinnering (minuten vooraf)</Label>
                <Input
                  id="recurring-remind"
                  type="number"
                  min={0}
                  max={600}
                  value={form.remindBeforeMinutes}
                  onChange={(e) =>
                    setForm({ ...form, remindBeforeMinutes: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {form.lateUntil
                ? `Klaar na ${form.time} maar voor ${form.lateUntil} telt nog als gedaan. De deadline zelf blijft ${form.time}.`
                : "Leeg laten betekent: de deadline is de grens. Zet hier je einde werkdag om te laat nog te laten tellen."}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Categorie</Label>
                <TaskCategorySelect
                  value={form.category}
                  onChange={(category) => setForm({ ...form, category })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioriteit</Label>
                <TaskPrioritySelect
                  value={form.priority}
                  onChange={(priority) => setForm({ ...form, priority })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Toegewezen aan</Label>
                <TaskAssigneeSelect
                  value={form.assigneeId}
                  onChange={(assigneeId) => setForm({ ...form, assigneeId })}
                  users={users}
                  allowAll
                  allLabel="Niemand"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Annuleren
              </Button>
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Opslaan" : "Toevoegen"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Taken die automatisch op het bord verschijnen. De sweep zet elke dag een
              echte taak klaar en pingt je op Telegram voor de deadline.
            </p>

            {rows === null ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Laden…
              </div>
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nog geen terugkerende taken.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {rows.map((row) => (
                  <div key={row.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            !row.active && "text-muted-foreground line-through"
                          )}
                        >
                          {row.title}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {describeDays(row.days)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          voor {formatMinutes(row.deadlineMinutes)}
                        </Badge>
                        {row.lateUntilMinutes != null &&
                          row.lateUntilMinutes > row.deadlineMinutes && (
                            <Badge
                              variant="outline"
                              className="border-brand/20 bg-brand/10 text-[10px] text-brand"
                            >
                              telt tot {formatMinutes(row.lateUntilMinutes)}
                            </Badge>
                          )}
                        {!row.active && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                          >
                            gepauzeerd
                          </Badge>
                        )}
                      </div>
                      {row.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {row.description}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={row.active ? "Pauzeren" : "Hervatten"}
                        onClick={() => toggleActive(row)}
                      >
                        {row.active ? (
                          <X className="h-3.5 w-3.5" />
                        ) : (
                          <Repeat className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Bewerken"
                        onClick={() => startEdit(row)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Verwijderen"
                        className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                        onClick={() => remove(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button onClick={startCreate} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nieuwe terugkerende taak
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
