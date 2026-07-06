import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getOrders } from "@/lib/wp-client";

export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const page = searchParams.get("page") || "1";
    const perPage = searchParams.get("per_page") || "10";

    const { data, headers } = await getOrders({ page, per_page: perPage });
    const total = parseInt(headers.get("X-WP-Total") || "0");

    return NextResponse.json({ data, total, page: parseInt(page) });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch orders", details: String(error) },
      { status: 500 }
    );
  }
}
