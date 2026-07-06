import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getPost, updatePost } from "@/lib/wp-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { data } = await getPost(parseInt(id));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch post", details: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { data } = await updatePost(parseInt(id), body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update post", details: String(error) },
      { status: 500 }
    );
  }
}
