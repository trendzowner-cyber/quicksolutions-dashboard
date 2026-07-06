import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getProducts } from "@/lib/wp-client";

export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = request.nextUrl;
    const params: Record<string, string> = {};

    const search = searchParams.get("search");
    if (search) params.search = search;

    const page = searchParams.get("page");
    if (page) params.page = page;

    const perPage = searchParams.get("per_page");
    params.per_page = perPage || "20";

    const category = searchParams.get("category");
    if (category) params.category = category;

    const status = searchParams.get("status");
    if (status) params.status = status;

    const { data, headers } = await getProducts(params);
    const total = parseInt(headers.get("X-WP-Total") || "0");
    const totalPages = parseInt(headers.get("X-WP-TotalPages") || "1");

    return NextResponse.json({
      data,
      total,
      totalPages,
      page: parseInt(page || "1"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch products", details: String(error) },
      { status: 500 }
    );
  }
}
