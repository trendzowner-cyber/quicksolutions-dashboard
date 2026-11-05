// One serializer for every task endpoint.
//
// Server-only: it pulls in the Prisma client. The client-safe types live in
// ./tasks.ts, which must never import this.

import { db } from "@/lib/db";
import { normalizePriority, type TaskData } from "@/lib/tasks";

export const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, username: true } },
  creator: { select: { id: true, name: true, username: true } },
  subtasks: { orderBy: { order: "asc" as const } },
  comments: {
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  timeLogs: true,
};

export type TaskWithRelations = NonNullable<
  Awaited<ReturnType<typeof db.task.findFirst<{ include: typeof TASK_INCLUDE }>>>
>;

export function serializeTask(t: TaskWithRelations): TaskData {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    status: t.status,
    priority: normalizePriority(t.priority),
    date: t.date,
    dueDate: t.dueDate || null,
    tags: t.tags,
    sortOrder: t.sortOrder,
    relatedType: t.relatedEntityType,
    relatedId: t.relatedEntityId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: t.completedAt?.toISOString() || null,
    assignee: t.assignee,
    creator: t.creator,
    subtasks: t.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.completed ? "done" : "todo",
      order: s.order,
    })),
    comments: t.comments.map((c) => ({
      id: c.id,
      content: c.text,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    })),
    timeLogs: t.timeLogs.map((l) => ({
      start: l.start.toISOString(),
      end: l.end?.toISOString() || undefined,
      duration: l.duration || undefined,
    })),
  };
}
