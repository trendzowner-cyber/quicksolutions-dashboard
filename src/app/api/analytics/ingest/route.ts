import { NextRequest, NextResponse } from "next/server";
import { ingestEvent, extractGeoFromRequest } from "@/lib/analytics";

// CORS headers for tracker requests (cross-origin from quicksolutionspro.be)
// Dynamic origin required — sendBeacon includes credentials, so wildcard * is rejected by browsers
function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function getOrigin(request: NextRequest): string | null {
  return request.headers.get("origin") || null;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(getOrigin(request)) });
}

export async function POST(request: NextRequest) {
  const origin = getOrigin(request);
  try {
    const body = await request.json();

    // Accept single event or batch
    const events = Array.isArray(body) ? body : [body];
    const geo = extractGeoFromRequest(request);

    for (const event of events) {
      if (!event.eventName || !event.sessionId || !event.visitorId) {
        continue; // Skip invalid events
      }

      // Merge geo data into event properties
      const properties = { ...(event.properties || {}), ...geo };

      await ingestEvent({
        eventName: event.eventName,
        sessionId: event.sessionId,
        visitorId: event.visitorId,
        occurredAt: event.occurredAt,
        properties,
      });
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders(origin) });
  } catch (error) {
    console.error("Analytics ingest error:", error);
    return NextResponse.json(
      { error: "Ingestion failed" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
