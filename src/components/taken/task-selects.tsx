"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NONE,
  STATUS_STYLE,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskUser,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

// base-ui treats "" as "no value", so a sentinel stands in for the empty
// choice everywhere a Select needs an unset option.

interface BaseProps {
  className?: string;
  disabled?: boolean;
}

export function TaskStatusSelect({
  value,
  onChange,
  className,
  disabled,
  size = "sm",
  allowAll = false,
  allLabel = "Alle statussen",
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "default";
  allowAll?: boolean;
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v != null && onChange(String(v))}>
      <SelectTrigger size={size} className={cn("w-full", className)} disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={NONE}>{allLabel}</SelectItem>}
        {TASK_STATUSES.map((s) => (
          <SelectItem key={s.key} value={s.key}>
            <span className={cn("size-2 shrink-0 rounded-full border", STATUS_STYLE[s.key])} />
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskPrioritySelect({
  value,
  onChange,
  className,
  disabled,
  size = "sm",
  allowAll = false,
  allLabel = "Alle prioriteiten",
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "default";
  allowAll?: boolean;
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v != null && onChange(String(v))}>
      <SelectTrigger size={size} className={cn("w-full", className)} disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={NONE}>{allLabel}</SelectItem>}
        {TASK_PRIORITIES.map((p) => (
          <SelectItem key={p.key} value={p.key}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskAssigneeSelect({
  value,
  onChange,
  users,
  className,
  disabled,
  size = "sm",
  allowAll = false,
  allLabel = "Iedereen",
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  users: TaskUser[];
  size?: "sm" | "default";
  allowAll?: boolean;
  allLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v != null && onChange(String(v))}>
      <SelectTrigger size={size} className={cn("w-full", className)} disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{allowAll ? allLabel : "Niemand"}</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaskCategorySelect({
  value,
  onChange,
  className,
  disabled,
  size = "sm",
  allowAll = false,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "default";
  allowAll?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => v != null && onChange(String(v))}>
      <SelectTrigger size={size} className={cn("w-full", className)} disabled={disabled}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={NONE}>Alle categorieën</SelectItem>}
        {TASK_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
