import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";

// GET → last 20 management actions for a review (newest first).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const actions = await db.reviewAction.findMany({
    where: { reviewId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ actions });
}
