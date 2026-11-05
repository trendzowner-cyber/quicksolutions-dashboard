"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarDays,
  Columns3,
  ListFilter,
  Rows3,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import {
  TaskAssigneeSelect,
  TaskCategorySelect,
  TaskPrioritySelect,
  TaskStatusSelect,
} from "./task-selects";
import { NONE, type TaskUser } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export type TaskView = "board" | "list" | "calendar";

export interface TaskFilters {
  status: string;
  priority: string;
  assigneeId: string;
  category: string;
  mineOnly: boolean;
  showClosed: boolean;
  overdueOnly: boolean;
}

export const EMPTY_FILTERS: TaskFilters = {
  status: NONE,
  priority: NONE,
  assigneeId: NONE,
  category: NONE,
  mineOnly: false,
  showClosed: false,
  overdueOnly: false,
};

export function hasActiveFilters(f: TaskFilters): boolean {
  return (
    f.status !== NONE ||
    f.priority !== NONE ||
    f.assigneeId !== NONE ||
    f.category !== NONE ||
    f.mineOnly ||
    f.overdueOnly
  );
}

const VIEWS: { key: TaskView; label: string; icon: typeof Columns3 }[] = [
  { key: "board", label: "Bord", icon: Columns3 },
  { key: "list", label: "Lijst", icon: Rows3 },
  { key: "calendar", label: "Kalender", icon: CalendarDays },
];

interface TaskToolbarProps {
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  search: string;
  onSearchChange: (value: string) => void;
  filters: TaskFilters;
  onFiltersChange: (patch: Partial<TaskFilters>) => void;
  onClearFilters: () => void;
  users: TaskUser[];
}

export function TaskToolbar({
  view,
  onViewChange,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  onClearFilters,
  users,
}: TaskToolbarProps) {
  const filtersActive = hasActiveFilters(filters);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* View switcher */}
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onViewChange(key)}
              aria-pressed={view === key}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Zoek in titel of beschrijving..."
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Button
          variant={filters.mineOnly ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          aria-pressed={filters.mineOnly}
          onClick={() => onFiltersChange({ mineOnly: !filters.mineOnly })}
        >
          <UserCheck className="h-3.5 w-3.5" />
          Mijn taken
        </Button>

        <Button
          variant={filters.showClosed ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          aria-pressed={filters.showClosed}
          onClick={() => onFiltersChange({ showClosed: !filters.showClosed })}
        >
          <ListFilter className="h-3.5 w-3.5" />
          Afgerond
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusSelect
          value={filters.status}
          onChange={(v) => onFiltersChange({ status: v })}
          allowAll
          className="w-40"
        />
        <TaskPrioritySelect
          value={filters.priority}
          onChange={(v) => onFiltersChange({ priority: v })}
          allowAll
          className="w-40"
        />
        <TaskAssigneeSelect
          value={filters.assigneeId}
          onChange={(v) => onFiltersChange({ assigneeId: v })}
          users={users}
          allowAll
          allLabel="Iedereen"
          className="w-40"
        />
        <TaskCategorySelect
          value={filters.category}
          onChange={(v) => onFiltersChange({ category: v })}
          allowAll
          className="w-40"
        />

        <Button
          variant={filters.overdueOnly ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          aria-pressed={filters.overdueOnly}
          onClick={() => onFiltersChange({ overdueOnly: !filters.overdueOnly })}
        >
          Te laat
        </Button>

        {filtersActive && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClearFilters}>
            <X className="h-3.5 w-3.5" />
            Filters wissen
          </Button>
        )}
      </div>
    </div>
  );
}
