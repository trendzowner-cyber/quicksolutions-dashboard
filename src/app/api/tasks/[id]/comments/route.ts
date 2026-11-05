import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

// POST — Add a comment to a task
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

    if (!body.content?.trim()) {
      return NextResponse.json({ error: "Reactie mag niet leeg zijn" }, { status: 400 });
    }

    // Verify task exists
    const task = await db.task.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    }

    const comment = await db.taskComment.create({
      data: {
        text: body.content.trim(),
        taskId: id,
        authorId: user.userId,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    // Serialized to match what the list and detail endpoints send, so the UI
    // can append it straight into state without a second round-trip.
    return NextResponse.json(
      {
        comment: {
          id: comment.id,
          content: comment.text,
          author: comment.author,
          createdAt: comment.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add comment", details: String(error) },
      { status: 500 }
    );
  }
}
