import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

// POST — Add a subtask to a task.
// The toggle endpoint existed on its own, so subtasks could be ticked but never
// created from the dashboard: they only ever arrived with a new task.
export async function POST(
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

    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Titel is verplicht" }, { status: 400 });
    }

    const task = await db.task.findUnique({ where: { id }, select: { id: true } });
    if (!task) {
      return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    }

    const highest = await db.subTask.aggregate({
      where: { taskId: id },
      _max: { order: true },
    });

    const subtask = await db.subTask.create({
      data: {
        taskId: id,
        title,
        order: (highest._max.order ?? -1) + 1,
      },
    });

    return NextResponse.json(
      {
        subtask: {
          id: subtask.id,
          title: subtask.title,
          status: subtask.completed ? "done" : "todo",
          order: subtask.order,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add subtask", details: String(error) },
      { status: 500 }
    );
  }
}
