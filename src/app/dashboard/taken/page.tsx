"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, RefreshCw, Repeat } from "lucide-react";
import {
  TaskBoard,
} from "@/components/taken/task-board";
import { TaskList, type SortField, type SortState } from "@/components/taken/task-list";
import { TaskCalendar } from "@/components/taken/task-calendar";
import { BulkActionsBar } from "@/components/taken/bulk-actions-bar";
import {
  EMPTY_FILTERS,
  TaskToolbar,
  hasActiveFilters,
  type TaskFilters,
  type TaskView,
} from "@/components/taken/task-toolbar";
import {
  TaskCreateDialog,
  TaskDetailDialog,
} from "@/components/taken/task-dialogs";
import { RecurringDialog } from "@/components/taken/recurring-dialog";
import {
  CLOSED_STATUSES,
  NONE,
  OPEN_STATUSES,
  isClosedStatus,
  isOverdue,
  priorityMeta,
  type TaskData,
  type TaskUser,
} from "@/lib/tasks";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Onbekende fout");
  return data as T;
}

export default function TakenPage() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  const [view, setView] = useState<TaskView>("board");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TaskFilters>({
    ...EMPTY_FILTERS,
    showClosed: true,
  });
  const [sort, setSort] = useState<SortState>({ field: "priority", dir: "desc" });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [detailTask, setDetailTask] = useState<TaskData | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{ status?: string; dueDate?: string }>({});
  const [recurringOpen, setRecurringOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setReloading(true);
    try {
      const [tRes, uRes, meRes] = await Promise.all([
        api<{ tasks: TaskData[] }>("/api/tasks"),
        api<{ users: TaskUser[] }>("/api/users?scope=assignable").catch(() => ({ users: [] })),
        api<{ user?: { id: string } }>("/api/auth/me").catch(
          () => ({}) as { user?: { id: string } }
        ),
      ]);
      setTasks(tRes.tasks ?? []);
      setUsers(uRes.users ?? []);
      setMeId(meRes.user?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kan taken niet laden");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Coming back to the tab refetches. This is what makes a task assigned while
  // the board was open actually appear: the assignment arrives as a Telegram
  // ping in another app, reading it takes you out of this tab, and the board is
  // current again by the time you look. Deliberately not an interval — the
  // board keeps its drag state to itself, and a background tick could land in
  // the middle of a drag.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  // A worker card, a notification in the bell, or the Telegram link points at
  // one task (`?task=<id>`). The id is resolved against the loaded board rather
  // than fetched, so the dialog always opens with the same shape the board is
  // holding.
  //
  // Keyed on the id instead of a once-ever flag: a second notification arriving
  // while the board is already open used to be dropped on the floor. And when
  // the id is not on the board yet the board is refetched once for it — a
  // notification regularly beats the next load, and "the link opened nothing"
  // is the worst possible answer.
  const deepLinkOpening = useRef<string | null>(null);
  const deepLinkOpened = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;

    const id = new URLSearchParams(window.location.search).get("task");
    if (!id || deepLinkOpened.current === id) return;

    const match = tasks.find((t) => t.id === id);
    if (!match) {
      // Guarded so a link to a task that does not exist cannot spin.
      if (tasks.length > 0 && deepLinkOpening.current !== id) {
        deepLinkOpening.current = id;
        load(true);
      }
      return;
    }

    deepLinkOpened.current = id;
    setDetailTask(match);
    // Closed columns are hidden by default — a link to a finished task must not
    // look like a link to nothing.
    if (isClosedStatus(match.status)) {
      setFilters((prev) => ({ ...prev, showClosed: true }));
    }
  }, [loading, tasks, load]);

  // ─── Derived ───

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!filters.showClosed && isClosedStatus(t.status)) return false;
      if (filters.status !== NONE && t.status !== filters.status) return false;
      if (filters.priority !== NONE && t.priority !== filters.priority) return false;
      if (filters.category !== NONE && t.category !== filters.category) return false;
      if (filters.assigneeId !== NONE && t.assignee?.id !== filters.assigneeId) {
        return false;
      }
      if (filters.mineOnly && t.assignee?.id !== meId) return false;
      if (filters.overdueOnly && !isOverdue(t.dueDate, t.status)) return false;
      if (needle) {
        const haystack = `${t.title} ${t.description ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [tasks, search, filters, meId]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.field) {
        case "title":
          return a.title.localeCompare(b.title, "nl") * dir;
        case "priority":
          return (priorityMeta(a.priority).weight - priorityMeta(b.priority).weight) * dir;
        case "dueDate":
          // Undated tasks sort last regardless of direction.
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate) * dir;
        case "createdAt":
          return a.createdAt.localeCompare(b.createdAt) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        default:
          return 0;
      }
    });
  }, [filtered, sort]);

  const stats = useMemo(() => {
    const open = tasks.filter((t) => !isClosedStatus(t.status));
    return {
      total: tasks.length,
      open: open.length,
      overdue: open.filter((t) => isOverdue(t.dueDate, t.status)).length,
      done: tasks.filter((t) => t.status === "done").length,
    };
  }, [tasks]);

  const boardStatuses = filters.showClosed
    ? [...OPEN_STATUSES, ...CLOSED_STATUSES]
    : OPEN_STATUSES;

  // ─── Mutations ───

  /**
   * Moves a task into a column at a position and renumbers both affected
   * columns, so the dense indices the server stores always stay contiguous.
   */
  const reorder = useCallback(
    async (taskId: string, toStatus: string, toIndex: number) => {
      const moved = tasks.find((t) => t.id === taskId);
      if (!moved) return;
      const fromStatus = moved.status;

      const target = tasks
        .filter((t) => t.status === toStatus && t.id !== taskId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const index = Math.max(0, Math.min(toIndex, target.length));
      target.splice(index, 0, { ...moved, status: toStatus });

      const source =
        fromStatus === toStatus
          ? []
          : tasks
              .filter((t) => t.status === fromStatus && t.id !== taskId)
              .sort((a, b) => a.sortOrder - b.sortOrder);

      const orderOf = new Map<string, number>();
      target.forEach((t, i) => orderOf.set(t.id, i));
      source.forEach((t, i) => orderOf.set(t.id, i));

      const previous = tasks;
      setTasks(
        tasks.map((t) => {
          const next = orderOf.get(t.id);
          if (next === undefined) return t;
          return {
            ...t,
            status: t.id === taskId ? toStatus : t.status,
            sortOrder: next,
            completedAt:
              t.id === taskId
                ? toStatus === "done"
                  ? new Date().toISOString()
                  : null
                : t.completedAt,
          };
        })
      );

      try {
        await api("/api/tasks", {
          method: "PUT",
          body: JSON.stringify({
            tasks: [
              ...target.map((t, i) => ({ id: t.id, status: toStatus, sortOrder: i })),
              ...source.map((t, i) => ({ id: t.id, sortOrder: i })),
            ],
          }),
        });
      } catch (err) {
        setTasks(previous);
        toast.error(err instanceof Error ? err.message : "Verplaatsen mislukt");
        load(true);
      }
    },
    [tasks, load]
  );

  /** Column change from a menu or inline select — always lands at the bottom. */
  const moveTask = useCallback(
    (id: string, status: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task || task.status === status) return;
      reorder(id, status, Number.MAX_SAFE_INTEGER);
    },
    [tasks, reorder]
  );

  async function deleteOne(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task || !confirm(`"${task.title}" verwijderen?`)) return;
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
      toast.success("Taak verwijderd");
    } catch (err) {
      setTasks(previous);
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function bulkApply(patch: {
    status?: string;
    priority?: string;
    assigneeId?: string | null;
  }) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) => {
        if (!ids.includes(t.id)) return t;
        const next: TaskData = { ...t };
        if (patch.status !== undefined) {
          next.status = patch.status;
          next.completedAt = patch.status === "done" ? new Date().toISOString() : null;
        }
        if (patch.priority !== undefined) next.priority = patch.priority;
        if (patch.assigneeId !== undefined) {
          next.assignee = patch.assigneeId
            ? users.find((u) => u.id === patch.assigneeId) ?? null
            : null;
        }
        return next;
      })
    );
    try {
      await api("/api/tasks", {
        method: "PUT",
        body: JSON.stringify({ tasks: ids.map((id) => ({ id, ...patch })) }),
      });
      toast.success(`${ids.length} taken bijgewerkt`);
      setSelectedIds(new Set());
    } catch (err) {
      setTasks(previous);
      toast.error(err instanceof Error ? err.message : "Bijwerken mislukt");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`${ids.length} taken verwijderen?`)) return;
    setBulkBusy(true);
    const previous = tasks;
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
    try {
      const result = await api<{ deleted: number; skipped: number }>("/api/tasks", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      if (result.skipped > 0) {
        toast.warning(`${result.deleted} verwijderd, ${result.skipped} overgeslagen (geen rechten)`);
        load(true);
      } else {
        toast.success(`${result.deleted} taken verwijderd`);
      }
      setSelectedIds(new Set());
    } catch (err) {
      setTasks(previous);
      toast.error(err instanceof Error ? err.message : "Verwijderen mislukt");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const all = filtered.every((t) => prev.has(t.id)) && filtered.length > 0;
      if (all) {
        const next = new Set(prev);
        filtered.forEach((t) => next.delete(t.id));
        return next;
      }
      return new Set([...prev, ...filtered.map((t) => t.id)]);
    });
  }

  function onSort(field: SortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "title" ? "asc" : "desc" }
    );
  }

  /** Only merges into the list — the detail dialog owns its own draft, and
   *  replacing its `task` prop mid-edit would reset the fields being typed. */
  function applyUpdate(id: string, patch: Partial<TaskData>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  // ─── Render ───

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-9 w-full max-w-xl" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taken</h1>
          <p className="text-sm text-muted-foreground">
            {stats.open} open
            {stats.overdue > 0 && (
              <span className="text-rose-600 dark:text-rose-400"> • {stats.overdue} te laat</span>
            )}
            {" • "}
            {stats.done} klaar van {stats.total}
            {filtered.length !== stats.total && ` • ${filtered.length} getoond`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Vernieuwen"
            onClick={() => load(true)}
            disabled={reloading}
          >
            <RefreshCw className={reloading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setRecurringOpen(true)}>
            <Repeat className="h-4 w-4" />
            Terugkerend
          </Button>
          <Button
            className="gap-1.5"
            onClick={() => {
              setCreateDefaults({});
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Taak Toevoegen
          </Button>
        </div>
      </div>

      <TaskToolbar
        view={view}
        onViewChange={setView}
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onClearFilters={() =>
          setFilters((prev) => ({ ...EMPTY_FILTERS, showClosed: prev.showClosed }))
        }
        users={users}
      />

      {view === "board" && (
        <TaskBoard
          tasks={filtered}
          statuses={boardStatuses}
          selectedIds={selectedIds}
          onOpen={setDetailTask}
          onToggleSelect={toggleSelect}
          onMove={moveTask}
          onDelete={deleteOne}
          onReorder={reorder}
          onAddToColumn={(status) => {
            setCreateDefaults({ status });
            setCreateOpen(true);
          }}
        />
      )}

      {view === "list" && (
        <TaskList
          tasks={sorted}
          selectedIds={selectedIds}
          sort={sort}
          onSort={onSort}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onOpen={setDetailTask}
          onMove={moveTask}
        />
      )}

      {view === "calendar" && (
        <TaskCalendar
          tasks={filtered}
          onOpen={setDetailTask}
          onAddOnDate={(dueDate) => {
            setCreateDefaults({ dueDate });
            setCreateOpen(true);
          }}
        />
      )}

      {filtered.length === 0 && tasks.length > 0 && (
        <div className="rounded-xl border border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Geen taken voor deze filters.
          </p>
          {hasActiveFilters(filters) && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                setFilters((prev) => ({ ...EMPTY_FILTERS, showClosed: prev.showClosed }))
              }
            >
              Filters wissen
            </Button>
          )}
        </div>
      )}

      <BulkActionsBar
        count={selectedIds.size}
        users={users}
        busy={bulkBusy}
        onApply={bulkApply}
        onDelete={bulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />

      <TaskCreateDialog
        key={`create-${createOpen}-${createDefaults.status ?? ""}-${createDefaults.dueDate ?? ""}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users}
        defaults={createDefaults}
        onCreated={(task) => setTasks((prev) => [task, ...prev])}
      />

      <TaskDetailDialog
        key={detailTask?.id ?? "no-task"}
        task={detailTask}
        users={users}
        onClose={() => setDetailTask(null)}
        onUpdated={applyUpdate}
        onDeleted={(id) => {
          setTasks((prev) => prev.filter((t) => t.id !== id));
          setDetailTask(null);
        }}
      />

      <RecurringDialog
        open={recurringOpen}
        onOpenChange={setRecurringOpen}
        users={users}
      />
    </div>
  );
}
