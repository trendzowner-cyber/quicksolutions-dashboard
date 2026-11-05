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
    const perPage = searchParams.get("per_page") || "20";
    const after = searchParams.get("after") || undefined;
    const before = searchParams.get("before") || undefined;
    const orderby = searchParams.get("orderby") || "date";
    const order = searchParams.get("order") || "desc";

    const params: Record<string, string> = { page, per_page: perPage, orderby, order };
    if (after) params.after = after;
    if (before) params.before = before;

    const { data, headers } = await getOrders(params);
    const total = parseInt(headers.get("X-WP-Total") || "0");

    return NextResponse.json({ data, total, page: parseInt(page) });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch orders", details: String(error) },
      { status: 500 }
    );
  }
}
