import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { fetchUptimeMonitors } from "@/lib/uptime";

// Uptime data lives in the raw monitoring.uptime_checks table (written by the
// qs-uptime-tick pg_cron job); the queries and the down rule moved to
// src/lib/uptime.ts so the Telegram commands and the briefing share them.
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const monitors = await fetchUptimeMonitors();
    return NextResponse.json({ monitors }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load monitoring data", details: String(error) },
      { status: 500 }
    );
  }
}
