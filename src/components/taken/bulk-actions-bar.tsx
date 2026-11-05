"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Trash2, X } from "lucide-react";
import {
  TaskAssigneeSelect,
  TaskPrioritySelect,
  TaskStatusSelect,
} from "./task-selects";
import { NONE, type TaskUser } from "@/lib/tasks";

interface BulkActionsBarProps {
  count: number;
  users: TaskUser[];
  busy: boolean;
  onApply: (patch: { status?: string; priority?: string; assigneeId?: string | null }) => void;
  onDelete: () => void;
  onClear: () => void;
}

/**
 * Sticky bar shown while cards are selected. Each Select stays pinned to the
 * placeholder value — picking an entry applies it and snaps back, so the bar
 * reads as a row of actions rather than as current state.
 */
export function BulkActionsBar({
  count,
  users,
  busy,
  onApply,
  onDelete,
  onClear,
}: BulkActionsBarProps) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-2 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-popover/95 p-2 shadow-lg backdrop-blur">
      <span className="px-1.5 text-xs font-medium tabular-nums">
        {count} geselecteerd
      </span>

      <div className="w-36">
        <TaskStatusSelect
          value={NONE}
          allLabel="Status wijzigen…"
          allowAll
          disabled={busy}
          onChange={(v) => v !== NONE && onApply({ status: v })}
        />
      </div>

      <div className="w-36">
        <TaskPrioritySelect
          value={NONE}
          allLabel="Prioriteit wijzigen…"
          allowAll
          disabled={busy}
          onChange={(v) => v !== NONE && onApply({ priority: v })}
        />
      </div>

      <div className="w-36">
        <TaskAssigneeSelect
          value={NONE}
          allLabel="Toewijzen aan…"
          allowAll
          users={users}
          disabled={busy}
          onChange={(v) => v !== NONE && onApply({ assigneeId: v === NONE ? null : v })}
        />
      </div>

      <Button
        variant="destructive"
        size="sm"
        className="gap-1.5"
        disabled={busy}
        onClick={onDelete}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Verwijderen
      </Button>

      <Button variant="ghost" size="icon-sm" aria-label="Selectie wissen" onClick={onClear} disabled={busy}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
