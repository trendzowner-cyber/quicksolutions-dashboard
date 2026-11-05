"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  MoreHorizontal,
  Calendar,
  User,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";
import {
  PRIORITY_STYLE,
  STATUS_STYLE,
  TASK_STATUSES,
  formatDate,
  isOverdue,
  isDueToday,
  priorityMeta,
  statusMeta,
  type TaskData,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: TaskData;
  selected: boolean;
  dragging: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (task: TaskData) => void;
  onMove: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export function TaskCard({
  task,
  selected,
  dragging,
  onToggleSelect,
  onOpen,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const priority = priorityMeta(task.priority);
  const overdue = isOverdue(task.dueDate, task.status);
  const dueToday = isDueToday(task.dueDate, task.status);
  const doneSubtasks = task.subtasks.filter((s) => s.status === "done").length;
  const progress = task.subtasks.length
    ? Math.round((doneSubtasks / task.subtasks.length) * 100)
    : 0;

  return (
    <div
      draggable
      onDragStart={(e) => {
        // Firefox refuses to start a drag unless some data is set.
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      className={cn(
        "group/card cursor-pointer rounded-lg border border-border bg-card p-2.5 space-y-2",
        "transition-colors hover:border-foreground/20 hover:bg-accent/40",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "border-primary/50 bg-primary/[0.06]",
        dragging && "opacity-40"
      )}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task);
        }
      }}
    >
      <div className="flex items-start gap-2">
        <div
          className="pt-0.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(task.id)}
            aria-label={`Selecteer ${task.title}`}
            className={cn(
              "transition-opacity",
              selected ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"
            )}
          />
        </div>

        <p className="flex-1 text-sm font-medium leading-snug break-words">
          {task.title}
        </p>

        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Kaartacties"
                  className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/card:opacity-100 data-[popup-open]:opacity-100"
                />
              }
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Verplaats naar</DropdownMenuLabel>
              {TASK_STATUSES.filter((s) => s.key !== task.status).map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => onMove(task.id, s.key)}>
                  <span
                    className={cn(
                      "size-2 rounded-full border",
                      STATUS_STYLE[s.key]
                    )}
                  />
                  {s.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onToggleSelect(task.id)}
                className="gap-2"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {selected ? "Deselecteren" : "Selecteren"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(task.id)}
                className="gap-2 text-rose-600 dark:text-rose-400 focus:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0", PRIORITY_STYLE[priority.key])}
        >
          {priority.label}
        </Badge>
        {task.category && task.category !== "algemeen" && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {task.category}
          </Badge>
        )}
      </div>

      {(task.assignee || task.dueDate || task.comments.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[11px] text-muted-foreground">
          {task.assignee && (
            <span className="flex items-center gap-1 truncate">
              <User className="h-3 w-3 shrink-0" />
              {task.assignee.name}
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                "flex items-center gap-1",
                overdue && "font-medium text-rose-600 dark:text-rose-400",
                dueToday && "font-medium text-amber-600 dark:text-amber-400"
              )}
            >
              <Calendar className="h-3 w-3 shrink-0" />
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.comments.length > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3 shrink-0" />
              {task.comments.length}
            </span>
          )}
        </div>
      )}

      {task.subtasks.length > 0 && (
        <div className="flex items-center gap-2 pl-6">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progress === 100 ? "bg-emerald-500" : "bg-violet-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {doneSubtasks}/{task.subtasks.length}
          </span>
        </div>
      )}
    </div>
  );
}

/** Thin insertion line shown between cards while dragging. */
export function DropLine({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "rounded-full transition-all",
        active ? "h-0.5 bg-primary" : "h-0.5 bg-transparent"
      )}
    />
  );
}

export function statusLabel(key: string): string {
  return statusMeta(key)?.label ?? key;
}
