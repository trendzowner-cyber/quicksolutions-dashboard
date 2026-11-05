"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DropLine, TaskCard } from "./task-card";
import {
  STATUS_COLUMN_STYLE,
  statusMeta,
  type TaskData,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

interface TaskBoardProps {
  tasks: TaskData[];
  statuses: string[];
  selectedIds: Set<string>;
  onOpen: (task: TaskData) => void;
  onToggleSelect: (id: string) => void;
  onMove: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  /** Drag-and-drop landed: move taskId into toStatus at position toIndex. */
  onReorder: (taskId: string, toStatus: string, toIndex: number) => void;
  onAddToColumn: (status: string) => void;
}

interface DropTarget {
  status: string;
  index: number;
}

export function TaskBoard({
  tasks,
  statuses,
  selectedIds,
  onOpen,
  onToggleSelect,
  onMove,
  onDelete,
  onReorder,
  onAddToColumn,
}: TaskBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const columns = statuses.map((status) => ({
    status,
    meta: statusMeta(status),
    items: tasks.filter((t) => t.status === status),
  }));

  function handleDrop(status: string) {
    if (!draggingId) return;
    const index = dropTarget?.status === status ? dropTarget.index : Number.MAX_SAFE_INTEGER;
    onReorder(draggingId, status, index);
    setDraggingId(null);
    setDropTarget(null);
  }

  /** Native drag does not scroll containers, so nudge the board at the edges. */
  function autoScroll(e: React.DragEvent) {
    const el = scrollerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 80;
    if (e.clientX < rect.left + EDGE) el.scrollLeft -= 18;
    else if (e.clientX > rect.right - EDGE) el.scrollLeft += 18;
  }

  return (
    <div
      ref={scrollerRef}
      className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 lg:snap-none"
    >
      {columns.map(({ status, meta, items }) => {
        const isOver = dropTarget?.status === status;
        return (
          <section
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              autoScroll(e);
              // Hovering the column but no card: land at the end.
              if (dropTarget?.status !== status) {
                setDropTarget({ status, index: items.length });
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropTarget((prev) => (prev?.status === status ? null : prev));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(status);
            }}
            className={cn(
              "flex w-[85vw] shrink-0 snap-center flex-col rounded-xl border p-2.5 transition-colors sm:w-72",
              STATUS_COLUMN_STYLE[status],
              isOver && "ring-2 ring-primary/40"
            )}
          >
            <header className="mb-2 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{meta?.label ?? status}</h3>
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {items.length}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Taak toevoegen aan ${meta?.label ?? status}`}
                onClick={() => onAddToColumn(status)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </header>

            <div className="flex max-h-[calc(100vh-19rem)] flex-1 flex-col gap-1 overflow-y-auto">
              {items.map((task, i) => (
                <div key={task.id} className="flex flex-col gap-1">
                  <DropLine active={isOver && dropTarget?.index === i} />
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      autoScroll(e);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY > rect.top + rect.height / 2;
                      setDropTarget({ status, index: i + (after ? 1 : 0) });
                    }}
                  >
                    <TaskCard
                      task={task}
                      selected={selectedIds.has(task.id)}
                      dragging={draggingId === task.id}
                      onToggleSelect={onToggleSelect}
                      onOpen={onOpen}
                      onMove={onMove}
                      onDelete={onDelete}
                      onDragStart={setDraggingId}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropTarget(null);
                      }}
                    />
                  </div>
                </div>
              ))}

              <DropLine active={isOver && dropTarget?.index === items.length} />

              {items.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {isOver ? "Hier loslaten" : "Geen taken"}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
