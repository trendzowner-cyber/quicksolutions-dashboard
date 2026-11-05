import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { db } from "@/lib/db";
import { isTaskStatus, normalizePriority } from "@/lib/tasks";
import { TASK_INCLUDE, serializeTask } from "@/lib/task-serialize";
import { notifyTaskAssigned } from "@/lib/task-notify";

// GET — List tasks with optional filters
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assigneeId = searchParams.get("assigneeId");
    const category = searchParams.get("category");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = normalizePriority(priority);
    if (assigneeId) where.assigneeId = assigneeId;
    if (category) where.category = category;

    const tasks = await db.task.findMany({
      where,
      include: TASK_INCLUDE,
      // Board order: column, then the manual position, then newest first as a
      // tie-breaker so nothing is ever unordered.
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ tasks: tasks.map(serializeTask) });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load tasks", details: String(error) },
      { status: 500 }
    );
  }
}

// POST — Create a new task
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Titel is verplicht" }, { status: 400 });
    }

    // A viewer is not staff, and two viewers must not be able to fill each
    // other's board with requests nobody asked for. The client is the exception:
    // the review team are all role `viewer`, so this rule would leave him able
    // to assign work to almost nobody — and handing work to that team is the
    // entire point of his interface.
    if (body.assigneeId && !hasRole(user.role, "marketer") && !isClientUserId(user.userId)) {
      const target = await db.user.findUnique({
        where: { id: String(body.assigneeId) },
        select: { role: true },
      });
      if (!target || target.role === "viewer") {
        return NextResponse.json(
          { error: "Je kan taken enkel toewijzen aan een teamlid" },
          { status: 403 }
        );
      }
    }

    const status = isTaskStatus(body.status) ? body.status : "todo";

    // Append to the end of its column rather than landing on top of whatever
    // happens to share sortOrder 0.
    const highest = await db.task.aggregate({
      where: { status },
      _max: { sortOrder: true },
    });

    const task = await db.task.create({
      data: {
        title: body.title.trim(),
        description: body.description || null,
        category: body.category || "algemeen",
        status,
        priority: normalizePriority(body.priority),
        date: body.date || new Date().toISOString().slice(0, 10),
        dueDate: body.dueDate || null,
        tags: body.tags || [],
        sortOrder: (highest._max.sortOrder ?? -1) + 1,
        relatedEntityType: body.relatedType || null,
        relatedEntityId: body.relatedId || null,
        assigneeId: body.assigneeId || null,
        creatorId: user.userId,
        subtasks: body.subtasks?.length
          ? {
              create: body.subtasks.map(
                (s: { title: string; order?: number }, i: number) => ({
                  title: s.title,
                  order: s.order ?? i,
                })
              ),
            }
          : undefined,
      },
      include: TASK_INCLUDE,
    });

    // Someone else's task is news; your own is not.
    await notifyTaskAssigned({
      taskId: task.id,
      title: task.title,
      assigneeId: task.assigneeId,
      actorId: user.userId,
      dueDate: task.dueDate,
    });

    return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create task", details: String(error) },
      { status: 500 }
    );
  }
}

// PUT — Batch update (drag-and-drop moved a column, bulk edit, reorder).
//
// sortOrder used to be declared in this handler's input type and then never
// written, so every reorder was silently discarded. Dense positions are
// supported now: the client sends the full ordered list for a column and the
// server stores the indices it is given.
export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tasks } = body as {
      tasks?: Array<{
        id: string;
        title?: string;
        status?: string;
        priority?: string;
        category?: string;
        assigneeId?: string | null;
        dueDate?: string | null;
        sortOrder?: number;
      }>;
    };

    if (!tasks?.length) {
      return NextResponse.json({ error: "No tasks to update" }, { status: 400 });
    }

    const invalid = tasks.find((t) => t.status !== undefined && !isTaskStatus(t.status));
    if (invalid) {
      return NextResponse.json(
        { error: `Onbekende status: ${invalid.status}` },
        { status: 400 }
      );
    }

    await db.$transaction(
      tasks.map((t) => {
        const data: Record<string, unknown> = {};
        if (t.title !== undefined) data.title = t.title;
        if (t.status !== undefined) {
          data.status = t.status;
          data.completedAt = t.status === "done" ? new Date() : null;
        }
        if (t.priority !== undefined) data.priority = normalizePriority(t.priority);
        if (t.category !== undefined) data.category = t.category;
        if (t.assigneeId !== undefined) data.assigneeId = t.assigneeId;
        if (t.dueDate !== undefined) data.dueDate = t.dueDate || null;
        if (t.sortOrder !== undefined) data.sortOrder = Math.max(0, Math.trunc(t.sortOrder));
        return db.task.update({ where: { id: t.id }, data });
      })
    );

    return NextResponse.json({ success: true, count: tasks.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update tasks", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE — Bulk delete. Applies the same per-task permission rule as the
// single-task endpoint and reports what it skipped rather than failing whole.
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ids } = (await request.json()) as { ids?: string[] };
    if (!ids?.length) {
      return NextResponse.json({ error: "Geen taken opgegeven" }, { status: 400 });
    }

    const tasks = await db.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, creatorId: true, assigneeId: true },
    });

    const isAdmin = user.role === "admin" || user.role === "owner";
    const allowed = tasks
      .filter(
        (t) =>
          isAdmin || t.creatorId === user.userId || t.assigneeId === user.userId
      )
      .map((t) => t.id);

    if (allowed.length) {
      await db.task.deleteMany({ where: { id: { in: allowed } } });
    }

    return NextResponse.json({
      success: true,
      deleted: allowed.length,
      skipped: tasks.length - allowed.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete tasks", details: String(error) },
      { status: 500 }
    );
  }
}
