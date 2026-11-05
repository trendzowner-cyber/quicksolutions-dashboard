import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH — Toggle subtask status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subtaskId } = await params;
    const body = await request.json();

    const existing = await db.subTask.findUnique({ where: { id: subtaskId } });
    if (!existing) {
      return NextResponse.json({ error: "Subtaak niet gevonden" }, { status: 404 });
    }

    const subtask = await db.subTask.update({
      where: { id: subtaskId },
      data: {
        ...(body.status !== undefined && { completed: body.status === "done" }),
        ...(body.title !== undefined && { title: body.title }),
      },
    });

    return NextResponse.json({ subtask });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update subtask", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE — Remove a subtask
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subtaskId } = await params;
    await db.subTask.delete({ where: { id: subtaskId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete subtask", details: String(error) },
      { status: 500 }
    );
  }
}
