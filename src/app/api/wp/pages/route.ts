import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getPages } from "@/lib/wp-client";

export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const params: Record<string, string> = {};
    const search = searchParams.get("search");
    if (search) params.search = search;
    params.per_page = searchParams.get("per_page") || "50";
    const page = searchParams.get("page");
    if (page) params.page = page;

    const { data, headers } = await getPages(params);
    const total = parseInt(headers.get("X-WP-Total") || "0");

    return NextResponse.json({ data, total });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch pages", details: String(error) },
      { status: 500 }
    );
  }
}
