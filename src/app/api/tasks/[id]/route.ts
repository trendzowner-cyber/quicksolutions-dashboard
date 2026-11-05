import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTaskStatus, normalizePriority } from "@/lib/tasks";
import { TASK_INCLUDE, serializeTask } from "@/lib/task-serialize";
import { notifyTaskAssigned } from "@/lib/task-notify";

// GET — Single task with all relations
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const task = await db.task.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });

    if (!task) {
      return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    }

    return NextResponse.json({ task: serializeTask(task) });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch task", details: String(error) },
      { status: 500 }
    );
  }
}

// PATCH — Update a single task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    }

    if (body.status !== undefined && !isTaskStatus(body.status)) {
      return NextResponse.json(
        { error: `Onbekende status: ${body.status}` },
        { status: 400 }
      );
    }
    if (body.title !== undefined && !String(body.title).trim()) {
      return NextResponse.json({ error: "Titel is verplicht" }, { status: 400 });
    }

    // Same rule as creating one: a viewer may hand work to someone who works
    // here, never to another viewer.
    const nextAssignee =
      body.assigneeId !== undefined
        ? body.assigneeId
          ? String(body.assigneeId)
          : null
        : undefined;
    if (nextAssignee && nextAssignee !== existing.assigneeId && !hasRole(user.role, "marketer")) {
      const target = await db.user.findUnique({
        where: { id: nextAssignee },
        select: { role: true },
      });
      if (!target || target.role === "viewer") {
        return NextResponse.json(
          { error: "Je kan taken enkel toewijzen aan een teamlid" },
          { status: 403 }
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.description !== undefined) data.description = body.description;
    if (body.status !== undefined) {
      data.status = body.status;
      data.completedAt = body.status === "done" ? new Date() : null;
    }
    if (body.priority !== undefined) data.priority = normalizePriority(body.priority);
    if (body.category !== undefined) data.category = body.category;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate || null;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.sortOrder !== undefined) {
      data.sortOrder = Math.max(0, Math.trunc(Number(body.sortOrder) || 0));
    }
    if (body.relatedType !== undefined) data.relatedEntityType = body.relatedType;
    if (body.relatedId !== undefined) data.relatedEntityId = body.relatedId;

    const task = await db.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });

    // Only a genuine change of hands is news — saving the title of a task that
    // was already someone's is not.
    if (task.assigneeId && task.assigneeId !== existing.assigneeId) {
      await notifyTaskAssigned({
        taskId: task.id,
        title: task.title,
        assigneeId: task.assigneeId,
        actorId: user.userId,
        dueDate: task.dueDate,
      });
    }

    return NextResponse.json({ task: serializeTask(task) });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update task", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE — Remove a task
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    }

    // Only creator, assignee, or admin can delete
    const isOwner = existing.creatorId === user.userId;
    const isAssignee = existing.assigneeId === user.userId;
    const isAdmin = user.role === "admin" || user.role === "owner";

    if (!isOwner && !isAssignee && !isAdmin) {
      return NextResponse.json({ error: "Geen rechten om deze taak te verwijderen" }, { status: 403 });
    }

    await db.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete task", details: String(error) },
      { status: 500 }
    );
  }
}
