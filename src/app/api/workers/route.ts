import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildWorkersBoard, canViewWorkers } from "@/lib/workers";

// Worker board for the client (Azedine). Gated by the per-user canViewWorkers
// flag — he is a "viewer" everywhere else in the dashboard, and nothing here
// exposes anything beyond presence and the recurring obligations he is paying
// for.
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canViewWorkers(session.userId, session.role))) {
    return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  }

  try {
    const board = await buildWorkersBoard();
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load workers", details: String(error) },
      { status: 500 }
    );
  }
}
