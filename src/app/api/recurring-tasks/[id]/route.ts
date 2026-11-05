import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeRecurring, type RecurringInput } from "../route";

// PATCH — partial edit (including the active toggle).
// DELETE — remove the obligation and unlink the tasks it already produced;
//          deleting those rows would erase history the client view relies on.

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!hasRole(user.role, "admin")) {
    return { error: NextResponse.json({ error: "Geen rechten" }, { status: 403 }) };
  }
  return { user };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const body = (await request.json()) as RecurringInput;
    const existing = await db.recurringTask.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }

    // Merge first, then validate — a PATCH that only flips `active` must not be
    // rejected for the fields it did not send.
    const data = normalizeRecurring({
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      category: body.category ?? existing.category,
      priority: body.priority ?? existing.priority,
      days: body.days ?? existing.days,
      deadlineMinutes: body.deadlineMinutes ?? existing.deadlineMinutes,
      // `??` would make the grace period impossible to clear once set — an
      // explicit null has to survive the merge.
      lateUntilMinutes:
        body.lateUntilMinutes !== undefined
          ? body.lateUntilMinutes
          : existing.lateUntilMinutes,
      remindBeforeMinutes: body.remindBeforeMinutes ?? existing.remindBeforeMinutes,
      assigneeId: body.assigneeId !== undefined ? body.assigneeId : existing.assigneeId,
    });

    if (!data.title) {
      return NextResponse.json({ error: "Titel is verplicht" }, { status: 400 });
    }
    if (!data.days.length) {
      return NextResponse.json({ error: "Kies minstens één dag" }, { status: 400 });
    }

    const recurring = await db.recurringTask.update({
      where: { id },
      data: { ...data, active: body.active ?? existing.active },
    });

    return NextResponse.json({ recurringTask: recurring });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update recurring task", details: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  try {
    const recurring = await db.recurringTask.findUnique({ where: { id } });
    if (!recurring) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }

    await db.task.updateMany({
      where: { recurringTaskId: id },
      data: { recurringTaskId: null },
    });
    await db.recurringTask.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete recurring task", details: String(err) },
      { status: 500 }
    );
  }
}
