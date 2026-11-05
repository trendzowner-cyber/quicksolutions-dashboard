"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TaskStatusSelect } from "./task-selects";
import {
  PRIORITY_STYLE,
  STATUS_STYLE,
  formatDate,
  isDueToday,
  isOverdue,
  priorityMeta,
  statusMeta,
  type TaskData,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

export type SortField = "title" | "priority" | "dueDate" | "createdAt" | "status";
export interface SortState {
  field: SortField;
  dir: "asc" | "desc";
}

interface TaskListProps {
  tasks: TaskData[];
  selectedIds: Set<string>;
  sort: SortState;
  onSort: (field: SortField) => void;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (task: TaskData) => void;
  onMove: (id: string, status: string) => void;
}

function SortHeader({
  field,
  label,
  sort,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sort: SortState;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sort.field === field;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
      >
        {label}
        <Icon className={cn("h-3 w-3", active ? "text-foreground" : "opacity-40")} />
      </button>
    </TableHead>
  );
}

export function TaskList({
  tasks,
  selectedIds,
  sort,
  onSort,
  onToggleSelect,
  onToggleAll,
  onOpen,
  onMove,
}: TaskListProps) {
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  const someSelected = tasks.some((t) => selectedIds.has(t.id));

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Alles selecteren"
                className={cn(!someSelected && "opacity-50")}
              />
            </TableHead>
            <SortHeader field="title" label="Titel" sort={sort} onSort={onSort} />
            <SortHeader field="status" label="Status" sort={sort} onSort={onSort} className="w-36" />
            <SortHeader field="priority" label="Prioriteit" sort={sort} onSort={onSort} className="w-28" />
            <TableHead className="w-36 text-xs font-medium">Toegewezen</TableHead>
            <SortHeader field="dueDate" label="Deadline" sort={sort} onSort={onSort} className="w-28" />
            <TableHead className="w-24 text-xs font-medium">Subtaken</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            const dueToday = isDueToday(task.dueDate, task.status);
            const done = task.subtasks.filter((s) => s.status === "done").length;
            const selected = selectedIds.has(task.id);

            return (
              <TableRow
                key={task.id}
                data-state={selected ? "selected" : undefined}
                className="cursor-pointer"
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleSelect(task.id)}
                    aria-label={`Selecteer ${task.title}`}
                  />
                </TableCell>

                <TableCell onClick={() => onOpen(task)}>
                  <span className="line-clamp-1 text-sm font-medium">{task.title}</span>
                  {task.category && task.category !== "algemeen" && (
                    <span className="text-[11px] text-muted-foreground">{task.category}</span>
                  )}
                </TableCell>

                <TableCell>
                  <TaskStatusSelect
                    value={task.status}
                    onChange={(status) => onMove(task.id, status)}
                  />
                </TableCell>

                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] px-1.5 py-0", PRIORITY_STYLE[priorityMeta(task.priority).key])}
                  >
                    {priorityMeta(task.priority).label}
                  </Badge>
                </TableCell>

                <TableCell className="text-xs text-muted-foreground">
                  {task.assignee?.name ?? "—"}
                </TableCell>

                <TableCell
                  className={cn(
                    "text-xs tabular-nums",
                    overdue && "font-medium text-rose-600 dark:text-rose-400",
                    dueToday && "font-medium text-amber-600 dark:text-amber-400",
                    !task.dueDate && "text-muted-foreground"
                  )}
                >
                  {task.dueDate ? formatDate(task.dueDate) : "—"}
                </TableCell>

                <TableCell className="text-xs tabular-nums text-muted-foreground">
                  {task.subtasks.length ? `${done}/${task.subtasks.length}` : "—"}
                </TableCell>
              </TableRow>
            );
          })}

          {tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                Geen taken gevonden
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/** Small status chip used outside the list (calendar, detail dialog). */
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", STATUS_STYLE[status])}>
      {statusMeta(status)?.label ?? status}
    </Badge>
  );
}
