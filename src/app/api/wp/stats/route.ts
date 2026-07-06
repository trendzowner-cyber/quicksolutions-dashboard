import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getStats } from "@/lib/wp-client";
import { getCached, setCache } from "@/lib/cache";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return cached data if fresh (< 60s)
  const cached = getCached<{ productCount: number; postCount: number; orderCount: number }>("stats");
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=30" },
    });
  }

  try {
    const stats = await getStats();
    setCache("stats", stats, 60);
    return NextResponse.json(stats, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=30" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch stats", details: String(error) },
      { status: 500 }
    );
  }
}
