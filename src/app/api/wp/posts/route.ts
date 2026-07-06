import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getPosts, createPost } from "@/lib/wp-client";

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
    params.per_page = searchParams.get("per_page") || "20";
    const status = searchParams.get("status");
    if (status) params.status = status;

    const { data, headers } = await getPosts(params);
    const total = parseInt(headers.get("X-WP-Total") || "0");
    const totalPages = parseInt(headers.get("X-WP-TotalPages") || "1");

    return NextResponse.json({ data, total, totalPages, page: parseInt(page || "1") });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch posts", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { data } = await createPost(body);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create post", details: String(error) },
      { status: 500 }
    );
  }
}
