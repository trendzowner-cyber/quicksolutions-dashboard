import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { db } from "@/lib/db";

// GET → recent uptime incidents for the status page.
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const incidents = await db.uptimeIncident.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      {
        incidents: incidents.map((i) => ({
          id: i.id,
          target: i.target,
          status: i.status,
          statusCode: i.statusCode,
          errorMsg: i.errorMsg,
          startedAt: i.startedAt.toISOString(),
          endedAt: i.endedAt?.toISOString() ?? null,
          durationSec: i.durationSec,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load incidents", details: String(error) },
      { status: 500 }
    );
  }
}
