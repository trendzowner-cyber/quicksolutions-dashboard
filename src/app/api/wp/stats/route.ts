import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getStats } from "@/lib/wp-client";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch stats", details: String(error) },
      { status: 500 }
    );
  }
}
